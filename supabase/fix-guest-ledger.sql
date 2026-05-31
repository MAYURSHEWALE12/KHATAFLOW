-- 1. Modify trigger to create guest user + ledger for unregistered friends
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
    -- If linked_user_id is already set, skip
    IF NEW.linked_user_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO found_user_id FROM public.users WHERE email = NEW.friend_email;

    IF found_user_id IS NULL THEN
        -- Friend has no account yet: create a guest user row
        found_user_id := gen_random_uuid();
        INSERT INTO public.users (id, name, email, avatar_url, provider)
        VALUES (found_user_id, NEW.friend_name, NEW.friend_email, NULL, 'invited');
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

-- 2. Update friend_relationships RLS: add explicit UPDATE policy (FOR ALL USING can be flaky)
DROP POLICY IF EXISTS "Users can manage their own friend list" ON public.friend_relationships;
CREATE POLICY "Users can manage their own friend list" ON public.friend_relationships
    FOR ALL
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- 3. Add INSERT policy for ledgers
DROP POLICY IF EXISTS "Ledger participants can insert ledgers" ON public.ledgers;
CREATE POLICY "Ledger participants can insert ledgers" ON public.ledgers
    FOR INSERT
    WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- 4. Fix ensure_user_profile to handle email conflicts
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
        name = COALESCE(NULLIF(p_name, ''), users.name),
        avatar_url = COALESCE(p_avatar_url, users.avatar_url);
END;
$$;
