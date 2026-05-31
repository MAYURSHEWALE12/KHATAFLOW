-- Upgraded, bulletproof migration for ensure_user_profile and handle_new_user.
-- Robustly migrates ledgers in canonical sorted order to bypass check_user_order check constraint violations in PostgreSQL.

-- 1. ensure_user_profile
CREATE OR REPLACE FUNCTION public.ensure_user_profile(
    p_user_id UUID,
    p_name TEXT,
    p_email TEXT,
    p_avatar_url TEXT DEFAULT NULL,
    p_provider TEXT DEFAULT 'email'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_id UUID;
    v_ledger RECORD;
    v_other_id UUID;
    v_new_user_a UUID;
    v_new_user_b UUID;
    v_new_ledger_id UUID;
BEGIN
    -- Find ANY existing row with matching email (case-insensitive)
    SELECT id INTO v_old_id FROM public.users
    WHERE LOWER(email) = LOWER(p_email)
    ORDER BY created_at ASC LIMIT 1;

    -- If an old row exists and is different from the real user ID, migrate it
    IF v_old_id IS NOT NULL AND v_old_id <> p_user_id THEN
        -- 1. Migrate friend relationships
        UPDATE public.friend_relationships SET owner_id = p_user_id WHERE owner_id = v_old_id;
        UPDATE public.friend_relationships SET linked_user_id = p_user_id WHERE linked_user_id = v_old_id;
        
        -- 2. Migrate ledgers robustly to prevent check_user_order violations
        FOR v_ledger IN SELECT * FROM public.ledgers WHERE user_a = v_old_id OR user_b = v_old_id LOOP
            -- Find the other participant
            IF v_ledger.user_a = v_old_id THEN
                v_other_id := v_ledger.user_b;
            ELSE
                v_other_id := v_ledger.user_a;
            END IF;

            -- Calculate canonical order for the new ledger
            v_new_user_a := LEAST(p_user_id, v_other_id);
            v_new_user_b := GREATEST(p_user_id, v_other_id);

            -- Get or create the new ledger
            INSERT INTO public.ledgers (user_a, user_b, balance)
            VALUES (v_new_user_a, v_new_user_b, v_ledger.balance)
            ON CONFLICT (user_a, user_b) DO UPDATE SET balance = ledgers.balance + EXCLUDED.balance
            RETURNING id INTO v_new_ledger_id;

            -- Move transactions to the new ledger
            UPDATE public.transactions SET ledger_id = v_new_ledger_id WHERE ledger_id = v_ledger.id;

            -- Delete the old ledger
            DELETE FROM public.ledgers WHERE id = v_ledger.id;
        END LOOP;

        -- 3. Move transactions created by this user
        UPDATE public.transactions SET created_by = p_user_id WHERE created_by = v_old_id;

        -- 4. Move notifications
        UPDATE public.notifications SET user_id = p_user_id WHERE user_id = v_old_id;
        
        -- 5. Delete the old user row
        DELETE FROM public.users WHERE id = v_old_id;
    END IF;

    -- Upsert the real user row
    INSERT INTO public.users (id, name, email, avatar_url, provider)
    VALUES (p_user_id, p_name, p_email, p_avatar_url, p_provider)
    ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(NULLIF(p_name, ''), users.name),
        email = p_email,
        avatar_url = COALESCE(p_avatar_url, users.avatar_url),
        provider = p_provider;
END;
$$;

-- 2. handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_id UUID;
    v_ledger RECORD;
    v_other_id UUID;
    v_new_user_a UUID;
    v_new_user_b UUID;
    v_new_ledger_id UUID;
BEGIN
    -- Find ANY existing row with matching email (case-insensitive)
    SELECT id INTO v_old_id FROM public.users
    WHERE LOWER(email) = LOWER(NEW.email)
    ORDER BY created_at ASC LIMIT 1;

    -- If an old row exists and is different from the new real user ID, migrate it
    IF v_old_id IS NOT NULL AND v_old_id <> NEW.id THEN
        -- 1. Migrate friend relationships
        UPDATE public.friend_relationships SET owner_id = NEW.id WHERE owner_id = v_old_id;
        UPDATE public.friend_relationships SET linked_user_id = NEW.id WHERE linked_user_id = v_old_id;
        
        -- 2. Migrate ledgers robustly to prevent check_user_order violations
        FOR v_ledger IN SELECT * FROM public.ledgers WHERE user_a = v_old_id OR user_b = v_old_id LOOP
            -- Find the other participant
            IF v_ledger.user_a = v_old_id THEN
                v_other_id := v_ledger.user_b;
            ELSE
                v_other_id := v_ledger.user_a;
            END IF;

            -- Calculate canonical order for the new ledger
            v_new_user_a := LEAST(NEW.id, v_other_id);
            v_new_user_b := GREATEST(NEW.id, v_other_id);

            -- Get or create the new ledger
            INSERT INTO public.ledgers (user_a, user_b, balance)
            VALUES (v_new_user_a, v_new_user_b, v_ledger.balance)
            ON CONFLICT (user_a, user_b) DO UPDATE SET balance = ledgers.balance + EXCLUDED.balance
            RETURNING id INTO v_new_ledger_id;

            -- Move transactions to the new ledger
            UPDATE public.transactions SET ledger_id = v_new_ledger_id WHERE ledger_id = v_ledger.id;

            -- Delete the old ledger
            DELETE FROM public.ledgers WHERE id = v_ledger.id;
        END LOOP;

        -- 3. Move transactions created by this user
        UPDATE public.transactions SET created_by = NEW.id WHERE created_by = v_old_id;

        -- 4. Move notifications
        UPDATE public.notifications SET user_id = NEW.id WHERE user_id = v_old_id;
        
        -- 5. Delete the old user row
        DELETE FROM public.users WHERE id = v_old_id;
    END IF;

    -- Upsert the real user row
    INSERT INTO public.users (id, name, email, avatar_url, provider)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'avatarUrl', NULL),
        COALESCE(NEW.app_metadata ->> 'provider', 'email')
    )
    ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)), ''), users.name),
        email = NEW.email,
        avatar_url = COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'avatarUrl', users.avatar_url),
        provider = COALESCE(NEW.app_metadata ->> 'provider', 'email');

    UPDATE public.friend_relationships
    SET linked_user_id = NEW.id
    WHERE LOWER(friend_email) = LOWER(NEW.email)
      AND linked_user_id IS NULL;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user error for email %: %', NEW.email, SQLERRM;
        RETURN NEW;
END;
$$;
