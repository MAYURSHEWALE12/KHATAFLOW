-- Backfill: create guest users + ledgers for existing friend_relationships
-- that were added before the trigger was updated.
DO $$
DECLARE
    fr RECORD;
    v_linked_user_id UUID;
    v_user_a UUID;
    v_user_b UUID;
    v_ledger_count INT;
BEGIN
    FOR fr IN SELECT * FROM public.friend_relationships WHERE linked_user_id IS NULL LOOP
        -- Create guest user
        v_linked_user_id := gen_random_uuid();
        INSERT INTO public.users (id, name, email, avatar_url, provider)
        VALUES (v_linked_user_id, fr.friend_name, fr.friend_email, NULL, 'invited');

        -- Update friend_relationship with new linked_user_id
        UPDATE public.friend_relationships SET linked_user_id = v_linked_user_id WHERE id = fr.id;

        -- Create ledger
        v_user_a := LEAST(fr.owner_id, v_linked_user_id);
        v_user_b := GREATEST(fr.owner_id, v_linked_user_id);

        INSERT INTO public.ledgers (user_a, user_b, balance)
        VALUES (v_user_a, v_user_b, 0.00)
        ON CONFLICT (user_a, user_b) DO NOTHING;
    END LOOP;
END;
$$;
