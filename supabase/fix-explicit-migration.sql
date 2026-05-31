-- Fix: use case-insensitive email matching in ensure_user_profile and handle_new_user
-- Guest emails are lowercased by frontend, but auth emails may have mixed case.
-- Without LOWER(), ON CONFLICT (email) won't match and migration silently fails.

-- 1. Case-insensitive unique index to prevent duplicate emails
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON public.users (LOWER(email));

-- 2. Updated ensure_user_profile with case-insensitive email lookup + explicit migration
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
    v_old_user_id UUID;
BEGIN
    -- Case-insensitive email lookup
    SELECT id INTO v_old_user_id FROM public.users WHERE LOWER(email) = LOWER(p_email);

    IF v_old_user_id IS NOT NULL THEN
        IF v_old_user_id <> p_user_id THEN
            -- Migrate child table references from old guest UUID to real user UUID
            UPDATE public.friend_relationships SET linked_user_id = p_user_id WHERE linked_user_id = v_old_user_id;
            UPDATE public.ledgers SET user_a = p_user_id WHERE user_a = v_old_user_id;
            UPDATE public.ledgers SET user_b = p_user_id WHERE user_b = v_old_user_id;
            UPDATE public.transactions SET created_by = p_user_id WHERE created_by = v_old_user_id;
            UPDATE public.notifications SET user_id = p_user_id WHERE user_id = v_old_user_id;
            DELETE FROM public.users WHERE id = v_old_user_id;
        END IF;
        -- Update the existing row (whether migrated or same id)
        UPDATE public.users SET
            name = COALESCE(NULLIF(p_name, ''), name),
            avatar_url = COALESCE(p_avatar_url, avatar_url),
            email = p_email,
            provider = p_provider
        WHERE id = p_user_id;
    ELSE
        INSERT INTO public.users (id, name, email, avatar_url, provider)
        VALUES (p_user_id, p_name, p_email, p_avatar_url, p_provider);
    END IF;
END;
$$;

-- 3. Updated handle_new_user trigger with the same approach
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_user_id UUID;
BEGIN
    SELECT id INTO v_old_user_id FROM public.users WHERE LOWER(email) = LOWER(NEW.email);

    IF v_old_user_id IS NOT NULL THEN
        IF v_old_user_id <> NEW.id THEN
            UPDATE public.friend_relationships SET linked_user_id = NEW.id WHERE linked_user_id = v_old_user_id;
            UPDATE public.ledgers SET user_a = NEW.id WHERE user_a = v_old_user_id;
            UPDATE public.ledgers SET user_b = NEW.id WHERE user_b = v_old_user_id;
            UPDATE public.transactions SET created_by = NEW.id WHERE created_by = v_old_user_id;
            UPDATE public.notifications SET user_id = NEW.id WHERE user_id = v_old_user_id;
            DELETE FROM public.users WHERE id = v_old_user_id;
        END IF;
        UPDATE public.users SET
            name = COALESCE(NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)), ''), name),
            avatar_url = COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'avatarUrl', avatar_url),
            email = NEW.email,
            provider = COALESCE(NEW.app_metadata ->> 'provider', 'email')
        WHERE id = NEW.id;
    ELSE
        INSERT INTO public.users (id, name, email, avatar_url, provider)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
            NEW.email,
            COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'avatarUrl', NULL),
            COALESCE(NEW.app_metadata ->> 'provider', 'email')
        );
    END IF;

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

-- 4. Update handle_friend_relationship_insert to use case-insensitive email match
CREATE OR REPLACE FUNCTION public.handle_friend_relationship_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    found_user_id UUID;
    ua UUID;
    ub UUID;
BEGIN
    IF NEW.linked_user_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO found_user_id FROM public.users WHERE LOWER(email) = LOWER(NEW.friend_email);

    IF found_user_id IS NULL THEN
        found_user_id := gen_random_uuid();
        INSERT INTO public.users (id, name, email, avatar_url, provider)
        VALUES (found_user_id, NEW.friend_name, LOWER(NEW.friend_email), NULL, 'invited');
    END IF;

    NEW.linked_user_id := found_user_id;

    ua := LEAST(NEW.owner_id, found_user_id);
    ub := GREATEST(NEW.owner_id, found_user_id);

    INSERT INTO public.ledgers (user_a, user_b, balance)
    VALUES (ua, ub, 0.00)
    ON CONFLICT (user_a, user_b) DO NOTHING;

    RETURN NEW;
END;
$$;
