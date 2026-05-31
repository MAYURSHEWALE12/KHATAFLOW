-- ==============================================================
-- FIX: When an invited friend signs up, migrate their guest
-- user row to their real auth UUID so they can see all
-- existing transactions.
-- ==============================================================

-- 1. Add ON UPDATE CASCADE to all FK referencing public.users(id)
--    so that updating a user's id cascades to child rows.

ALTER TABLE public.friend_relationships
    DROP CONSTRAINT IF EXISTS friend_relationships_owner_id_fkey,
    ADD CONSTRAINT friend_relationships_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.friend_relationships
    DROP CONSTRAINT IF EXISTS friend_relationships_linked_user_id_fkey,
    ADD CONSTRAINT friend_relationships_linked_user_id_fkey
        FOREIGN KEY (linked_user_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.ledgers
    DROP CONSTRAINT IF EXISTS ledgers_user_a_fkey,
    ADD CONSTRAINT ledgers_user_a_fkey
        FOREIGN KEY (user_a) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.ledgers
    DROP CONSTRAINT IF EXISTS ledgers_user_b_fkey,
    ADD CONSTRAINT ledgers_user_b_fkey
        FOREIGN KEY (user_b) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.transactions
    DROP CONSTRAINT IF EXISTS transactions_created_by_fkey,
    ADD CONSTRAINT transactions_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_user_id_fkey,
    ADD CONSTRAINT notifications_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Update handle_new_user() to upsert on email,
--    migrating the guest UUID to the real auth UUID.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
        id = EXCLUDED.id,
        name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url);
    
    -- Link any pending friend relationships (should already be
    -- linked via ON UPDATE CASCADE, but this catches edge cases)
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

-- 3. Update ensure_user_profile RPC to also handle guest → real migration

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
BEGIN
    INSERT INTO public.users (id, name, email, avatar_url, provider)
    VALUES (p_user_id, p_name, p_email, p_avatar_url, p_provider)
    ON CONFLICT (email) DO UPDATE SET
        id = EXCLUDED.id,
        name = COALESCE(NULLIF(p_name, ''), users.name),
        avatar_url = COALESCE(p_avatar_url, users.avatar_url);
END;
$$;
