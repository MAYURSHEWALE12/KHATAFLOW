-- Bulletproof ensure_user_profile and handle_new_user.
-- Handles the case where guest + real user rows both exist for the same email.

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
    v_guest_id UUID;
BEGIN
    -- Find guest row (provider = 'invited') with matching email (case-insensitive)
    SELECT id INTO v_guest_id FROM public.users
    WHERE LOWER(email) = LOWER(p_email) AND provider = 'invited'
    ORDER BY created_at ASC LIMIT 1;

    -- If guest row exists and is different from the real user ID, migrate it
    IF v_guest_id IS NOT NULL AND v_guest_id <> p_user_id THEN
        UPDATE public.friend_relationships SET linked_user_id = p_user_id WHERE linked_user_id = v_guest_id;
        UPDATE public.ledgers SET user_a = p_user_id WHERE user_a = v_guest_id;
        UPDATE public.ledgers SET user_b = p_user_id WHERE user_b = v_guest_id;
        UPDATE public.transactions SET created_by = p_user_id WHERE created_by = v_guest_id;
        UPDATE public.notifications SET user_id = p_user_id WHERE user_id = v_guest_id;
        DELETE FROM public.users WHERE id = v_guest_id;
    END IF;

    -- Upsert the real user row (handles case where row already exists from previous signup)
    INSERT INTO public.users (id, name, email, avatar_url, provider)
    VALUES (p_user_id, p_name, p_email, p_avatar_url, p_provider)
    ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(NULLIF(p_name, ''), users.name),
        email = p_email,
        avatar_url = COALESCE(p_avatar_url, users.avatar_url),
        provider = p_provider;
END;
$$;

-- 2. handle_new_user trigger (same pattern)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_guest_id UUID;
BEGIN
    SELECT id INTO v_guest_id FROM public.users
    WHERE LOWER(email) = LOWER(NEW.email) AND provider = 'invited'
    ORDER BY created_at ASC LIMIT 1;

    IF v_guest_id IS NOT NULL AND v_guest_id <> NEW.id THEN
        UPDATE public.friend_relationships SET linked_user_id = NEW.id WHERE linked_user_id = v_guest_id;
        UPDATE public.ledgers SET user_a = NEW.id WHERE user_a = v_guest_id;
        UPDATE public.ledgers SET user_b = NEW.id WHERE user_b = v_guest_id;
        UPDATE public.transactions SET created_by = NEW.id WHERE created_by = v_guest_id;
        UPDATE public.notifications SET user_id = NEW.id WHERE user_id = v_guest_id;
        DELETE FROM public.users WHERE id = v_guest_id;
    END IF;

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
