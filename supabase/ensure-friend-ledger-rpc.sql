-- ==============================================================
-- Ensure a ledger exists for a friend_relationship (called from
-- frontend as on-demand fallback when clicking a friend)
-- ==============================================================
CREATE OR REPLACE FUNCTION public.ensure_friend_ledger(p_friend_rel_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_fr public.friend_relationships%ROWTYPE;
    v_linked_user_id UUID;
    v_user_a UUID;
    v_user_b UUID;
    v_ledger_id UUID;
BEGIN
    SELECT * INTO v_fr FROM public.friend_relationships WHERE id = p_friend_rel_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Friend relationship not found';
    END IF;

    -- Check if a ledger already exists
    IF v_fr.linked_user_id IS NOT NULL THEN
        v_user_a := LEAST(v_fr.owner_id, v_fr.linked_user_id);
        v_user_b := GREATEST(v_fr.owner_id, v_fr.linked_user_id);

        SELECT id INTO v_ledger_id FROM public.ledgers
        WHERE (user_a = v_user_a AND user_b = v_user_b);

        IF FOUND THEN
            RETURN v_ledger_id;
        END IF;
    END IF;

    -- Create guest user if friend has no linked account
    IF v_fr.linked_user_id IS NULL THEN
        v_linked_user_id := gen_random_uuid();
        INSERT INTO public.users (id, name, email, avatar_url, provider)
        VALUES (v_linked_user_id, v_fr.friend_name, v_fr.friend_email, NULL, 'invited');
        UPDATE public.friend_relationships SET linked_user_id = v_linked_user_id WHERE id = p_friend_rel_id;
    ELSE
        v_linked_user_id := v_fr.linked_user_id;
    END IF;

    v_user_a := LEAST(v_fr.owner_id, v_linked_user_id);
    v_user_b := GREATEST(v_fr.owner_id, v_linked_user_id);

    INSERT INTO public.ledgers (user_a, user_b, balance)
    VALUES (v_user_a, v_user_b, 0.00)
    ON CONFLICT (user_a, user_b) DO NOTHING
    RETURNING id INTO v_ledger_id;

    RETURN v_ledger_id;
END;
$$;
