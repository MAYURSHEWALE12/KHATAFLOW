-- KHATAFLOW PostgreSQL Schema

-- 1. Users table (mirrors and expands auth.users)
-- Removed foreign key reference to auth.users to support guest users (invited friends)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    provider TEXT DEFAULT 'email',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Case-insensitive unique index to prevent duplicate emails
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON public.users (LOWER(email));

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Friend Relationships table
CREATE TABLE IF NOT EXISTS public.friend_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    friend_email TEXT NOT NULL,
    friend_name TEXT NOT NULL,
    phone TEXT,
    linked_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_owner_friend_email UNIQUE (owner_id, friend_email)
);

ALTER TABLE public.friend_relationships ENABLE ROW LEVEL SECURITY;

-- 3. Shared Ledgers table
CREATE TABLE IF NOT EXISTS public.ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user_b UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    balance NUMERIC(12, 2) DEFAULT 0.00 NOT NULL, -- positive means user_a is owed, negative means user_b is owed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_ledger_pair UNIQUE (user_a, user_b),
    CONSTRAINT check_user_order CHECK (user_a < user_b) -- Enforces canonical order to avoid duplicates
);

ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;

-- 4. Transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES public.users(id),
    type TEXT NOT NULL CHECK (type IN ('credit_given', 'payment_received', 'expense', 'adjustment', 'settlement', 'refund')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    attachment_url TEXT,
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 5. Attachments table (for scalability/multiple attachments in the future)
CREATE TABLE IF NOT EXISTS public.attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- 6. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;


-- ==============================================================
-- AUTOMATIC HANDLERS AND TRIGGERS
-- ==============================================================

-- Trigger to automatically create a profile in public.users on signup
-- Bulletproof migration handles guest to real user conversion seamlessly with case-insensitivity.
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
        -- Step A: Free up the email unique constraint on the old row by changing its email
        UPDATE public.users 
        SET email = id::text || '@temp-migration.placeholder' 
        WHERE id = v_old_id;

        -- Step B: Insert/upsert the new user row so it exists in public.users for foreign key checks
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

        -- Step C: Migrate child references to the newly inserted real user profile
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
    ELSE
        -- If no migration needed, just upsert the real user row
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Trigger to link user_id if a friend relationship is added for an already-registered user
CREATE OR REPLACE FUNCTION public.handle_friend_relationship_insert()
RETURNS TRIGGER AS $$
DECLARE
    found_user_id UUID;
    ua UUID;
    ub UUID;
BEGIN
    -- If linked_user_id is already set, skip
    IF NEW.linked_user_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Case-insensitive lookup
    SELECT id INTO found_user_id FROM public.users WHERE LOWER(email) = LOWER(NEW.friend_email);

    IF found_user_id IS NULL THEN
        -- Friend has no account yet: create a guest user row (using lower-cased email)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friend_relationship_created ON public.friend_relationships;
CREATE TRIGGER on_friend_relationship_created
    BEFORE INSERT ON public.friend_relationships
    FOR EACH ROW EXECUTE FUNCTION public.handle_friend_relationship_insert();


-- Trigger to maintain live balances on ledger when transactions are added
CREATE OR REPLACE FUNCTION public.update_ledger_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_user_a UUID;
    v_user_b UUID;
    v_diff NUMERIC(12, 2);
BEGIN
    -- Get ledger users
    SELECT user_a, user_b INTO v_user_a, v_user_b 
    FROM public.ledgers WHERE id = NEW.ledger_id;
    
    -- Calculate how the transaction affects balance relative to user_a:
    -- 'credit_given': Creator lent money. If creator is user_a, balance increases. If creator is user_b, balance decreases.
    -- 'payment_received': Creator received a repayment. If creator is user_a (meaning user_b repaid), balance decreases (closer to 0). If creator is user_b (user_a repaid), balance increases.
    -- 'expense': Shared expense. Usually paid by creator. We split 50/50.
    -- Let's define:
    -- LENT (credit_given) adds to what debtor owes.
    -- PAID (payment_received / settlement) reduces the outstanding debt.
    
    IF NEW.type = 'credit_given' THEN
        -- If user_a lent, Rahul (user_b) owes more -> balance goes up.
        IF NEW.created_by = v_user_a THEN
            v_diff := NEW.amount;
        ELSE
            v_diff := -NEW.amount;
        END IF;
    ELSIF NEW.type = 'payment_received' OR NEW.type = 'settlement' THEN
        -- If user_a received a payment (user_b paid user_a), user_b owes less -> balance goes down (towards 0 or negative).
        IF NEW.created_by = v_user_a THEN
            v_diff := -NEW.amount;
        ELSE
            v_diff := NEW.amount;
        END IF;
    ELSIF NEW.type = 'expense' THEN
        -- Split 50/50. If user_a paid, user_b owes user_a half the amount -> balance goes up by half.
        IF NEW.created_by = v_user_a THEN
            v_diff := NEW.amount / 2.0;
        ELSE
            v_diff := -NEW.amount / 2.0;
        END IF;
    ELSIF NEW.type = 'adjustment' THEN
        -- Manual adjustment.
        IF NEW.created_by = v_user_a THEN
            v_diff := NEW.amount;
        ELSE
            v_diff := -NEW.amount;
        END IF;
    ELSE
        v_diff := 0;
    END IF;

    UPDATE public.ledgers
    SET balance = balance + v_diff,
        updated_at = NOW()
    WHERE id = NEW.ledger_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_transaction_inserted ON public.transactions;
CREATE TRIGGER on_transaction_inserted
    AFTER INSERT ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.update_ledger_balance();


-- ==============================================================
-- RLS POLICIES
-- ==============================================================

-- Users: read all profiles, update own
DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;
CREATE POLICY "Users can view all profiles" ON public.users FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Friends: owner can manage, anyone can read if linked
DROP POLICY IF EXISTS "Users can manage their own friend list" ON public.friend_relationships;
CREATE POLICY "Users can manage their own friend list" ON public.friend_relationships 
    FOR ALL USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Users can view relationships where they are added" ON public.friend_relationships;
CREATE POLICY "Users can view relationships where they are added" ON public.friend_relationships 
    FOR SELECT USING (auth.uid() = linked_user_id);

-- Ledgers: participants can read/update
DROP POLICY IF EXISTS "Ledger participants can read their ledger" ON public.ledgers;
CREATE POLICY "Ledger participants can read their ledger" ON public.ledgers 
    FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Transactions: participants of the ledger can read/write
DROP POLICY IF EXISTS "Ledger participants can view transactions" ON public.transactions;
CREATE POLICY "Ledger participants can view transactions" ON public.transactions 
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.ledgers 
            WHERE id = transactions.ledger_id AND (user_a = auth.uid() OR user_b = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Ledger participants can insert transactions" ON public.transactions;
CREATE POLICY "Ledger participants can insert transactions" ON public.transactions 
    FOR INSERT WITH CHECK (
        auth.uid() = created_by AND
        EXISTS (
            SELECT 1 FROM public.ledgers 
            WHERE id = ledger_id AND (user_a = auth.uid() OR user_b = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Ledger participants can update transactions" ON public.transactions;
CREATE POLICY "Ledger participants can update transactions" ON public.transactions 
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.ledgers 
            WHERE id = transactions.ledger_id AND (user_a = auth.uid() OR user_b = auth.uid())
        )
    );


-- ==============================================================
-- DELETE TRANSACTION SUPPORT
-- ==============================================================

-- Trigger to reverse ledger balance when a transaction is soft-deleted
CREATE OR REPLACE FUNCTION public.update_ledger_balance_on_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_user_a UUID;
    v_user_b UUID;
    v_diff NUMERIC(12, 2);
BEGIN
    IF NEW.is_deleted = OLD.is_deleted THEN
        RETURN NEW;
    END IF;

    SELECT user_a, user_b INTO v_user_a, v_user_b 
    FROM public.ledgers WHERE id = NEW.ledger_id;

    -- Reverse the original diff
    IF NEW.type = 'credit_given' THEN
        IF NEW.created_by = v_user_a THEN
            v_diff := -NEW.amount;
        ELSE
            v_diff := NEW.amount;
        END IF;
    ELSIF NEW.type = 'payment_received' OR NEW.type = 'settlement' THEN
        IF NEW.created_by = v_user_a THEN
            v_diff := NEW.amount;
        ELSE
            v_diff := -NEW.amount;
        END IF;
    ELSIF NEW.type = 'expense' THEN
        IF NEW.created_by = v_user_a THEN
            v_diff := -(NEW.amount / 2.0);
        ELSE
            v_diff := NEW.amount / 2.0;
        END IF;
    ELSIF NEW.type = 'adjustment' THEN
        IF NEW.created_by = v_user_a THEN
            v_diff := -NEW.amount;
        ELSE
            v_diff := NEW.amount;
        END IF;
    ELSE
        v_diff := 0;
    END IF;

    UPDATE public.ledgers
    SET balance = balance + v_diff,
        updated_at = NOW()
    WHERE id = NEW.ledger_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_transaction_deleted ON public.transactions;
CREATE TRIGGER on_transaction_deleted
    AFTER UPDATE OF is_deleted ON public.transactions
    FOR EACH ROW
    WHEN (NEW.is_deleted = true AND OLD.is_deleted = false)
    EXECUTE FUNCTION public.update_ledger_balance_on_delete();


-- RPC: Soft-delete a transaction (called from frontend)
CREATE OR REPLACE FUNCTION public.soft_delete_transaction(p_transaction_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.transactions
    SET is_deleted = true,
        description = 'This entry was deleted'
    WHERE id = p_transaction_id
        AND is_deleted = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: Get all transactions for a user's ledgers
CREATE OR REPLACE FUNCTION public.get_user_transactions(p_user_id UUID)
RETURNS SETOF public.transactions AS $$
BEGIN
    RETURN QUERY
    SELECT t.*
    FROM public.transactions t
    INNER JOIN public.ledgers l ON l.id = t.ledger_id
    WHERE (l.user_a = p_user_id OR l.user_b = p_user_id)
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: Ensure a user profile exists in public.users (called from frontend after signup)
-- Bulletproof migration handles guest/stale real user to new real user conversion seamlessly with case-insensitivity.
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
        -- Step A: Free up the email unique constraint on the old row by changing its email
        UPDATE public.users 
        SET email = id::text || '@temp-migration.placeholder' 
        WHERE id = v_old_id;

        -- Step B: Insert/upsert the new user row so it exists in public.users for foreign key checks
        INSERT INTO public.users (id, name, email, avatar_url, provider)
        VALUES (p_user_id, p_name, p_email, p_avatar_url, p_provider)
        ON CONFLICT (id) DO UPDATE SET
            name = COALESCE(NULLIF(p_name, ''), users.name),
            email = p_email,
            avatar_url = COALESCE(p_avatar_url, users.avatar_url),
            provider = p_provider;

        -- Step C: Migrate child references to the newly inserted real user profile
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
    ELSE
        -- If no migration needed, just upsert the real user row
        INSERT INTO public.users (id, name, email, avatar_url, provider)
        VALUES (p_user_id, p_name, p_email, p_avatar_url, p_provider)
        ON CONFLICT (id) DO UPDATE SET
            name = COALESCE(NULLIF(p_name, ''), users.name),
            email = p_email,
            avatar_url = COALESCE(p_avatar_url, users.avatar_url),
            provider = p_provider;
    END IF;
END;
$$;
