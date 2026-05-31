-- Fix ensure_user_profile to explicitly migrate guest user references
-- instead of relying on ON UPDATE CASCADE (which may not work reliably).

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
    -- Check if a guest row with this email already exists
    SELECT id INTO v_old_user_id FROM public.users WHERE email = p_email;

    IF v_old_user_id IS NOT NULL AND v_old_user_id <> p_user_id THEN
        -- Migrate: update all child table references to the real user ID
        UPDATE public.friend_relationships SET linked_user_id = p_user_id WHERE linked_user_id = v_old_user_id;
        UPDATE public.ledgers SET user_a = p_user_id WHERE user_a = v_old_user_id;
        UPDATE public.ledgers SET user_b = p_user_id WHERE user_b = v_old_user_id;
        UPDATE public.transactions SET created_by = p_user_id WHERE created_by = v_old_user_id;
        UPDATE public.notifications SET user_id = p_user_id WHERE user_id = v_old_user_id;
        -- Delete the old guest row (child refs already updated, so FK OK)
        DELETE FROM public.users WHERE id = v_old_user_id;
    END IF;

    -- Upsert the real user row
    INSERT INTO public.users (id, name, email, avatar_url, provider)
    VALUES (p_user_id, p_name, p_email, p_avatar_url, p_provider)
    ON CONFLICT (email) DO UPDATE SET
        name = COALESCE(NULLIF(p_name, ''), users.name),
        avatar_url = COALESCE(p_avatar_url, users.avatar_url);
END;
$$;

-- Also fix handle_new_user() trigger the same way
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_user_id UUID;
BEGIN
    SELECT id INTO v_old_user_id FROM public.users WHERE email = NEW.email;

    IF v_old_user_id IS NOT NULL AND v_old_user_id <> NEW.id THEN
        UPDATE public.friend_relationships SET linked_user_id = NEW.id WHERE linked_user_id = v_old_user_id;
        UPDATE public.ledgers SET user_a = NEW.id WHERE user_a = v_old_user_id;
        UPDATE public.ledgers SET user_b = NEW.id WHERE user_b = v_old_user_id;
        UPDATE public.transactions SET created_by = NEW.id WHERE created_by = v_old_user_id;
        UPDATE public.notifications SET user_id = NEW.id WHERE user_id = v_old_user_id;
        DELETE FROM public.users WHERE id = v_old_user_id;
    END IF;

    INSERT INTO public.users (id, name, email, avatar_url, provider)
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'name',
            NEW.raw_user_meta_data ->> 'full_name',
            split_part(NEW.email, '@', 1)
        ),
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data ->> 'avatar_url',
            NEW.raw_user_meta_data ->> 'avatarUrl',
            NULL
        ),
        COALESCE(NEW.app_metadata ->> 'provider', 'email')
    )
    ON CONFLICT (email) DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url);

    UPDATE public.friend_relationships
    SET linked_user_id = NEW.id
    WHERE friend_email = NEW.email
      AND linked_user_id IS NULL;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user error for email %: %', NEW.email, SQLERRM;
        RETURN NEW;
END;
$$;
