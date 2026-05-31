-- KHATAFLOW PostgreSQL Schema

-- 1. Users table (mirrors and expands auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    provider TEXT DEFAULT 'email',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

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
    );
    
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Trigger to link user_id if a friend relationship is added for an already-registered user
CREATE OR REPLACE FUNCTION public.handle_friend_relationship_insert()
RETURNS TRIGGER AS $$
DECLARE
    found_user_id UUID;
BEGIN
    SELECT id INTO found_user_id FROM public.users WHERE email = NEW.friend_email;
    IF found_user_id IS NOT NULL THEN
        NEW.linked_user_id := found_user_id;
        
        -- Auto-create a shared ledger between owner_id and linked_user_id if it doesn't exist
        DECLARE
            ua UUID := LEAST(NEW.owner_id, found_user_id);
            ub UUID := GREATEST(NEW.owner_id, found_user_id);
        BEGIN
            INSERT INTO public.ledgers (user_a, user_b, balance)
            VALUES (ua, ub, 0.00)
            ON CONFLICT (user_a, user_b) DO NOTHING;
        END;
    END IF;
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
CREATE OR REPLACE FUNCTION public.ensure_user_profile(
    p_user_id UUID,
    p_name TEXT,
    p_email TEXT,
    p_avatar_url TEXT DEFAULT NULL,
    p_provider TEXT DEFAULT 'email'
)
RETURNS void AS $$
BEGIN
    INSERT INTO public.users (id, name, email, avatar_url, provider)
    VALUES (p_user_id, p_name, p_email, p_avatar_url, p_provider)
    ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(NULLIF(p_name, ''), users.name),
        avatar_url = COALESCE(p_avatar_url, users.avatar_url);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
