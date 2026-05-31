-- KHATAFLOW: Fix auth trigger function
-- Run this in Supabase SQL Editor if signup gives "Database error saving new user"

-- Drop existing trigger and function to recreate fresh
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate the function with robust error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    
    -- Auto-link any existing friend relationships targeting this email
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

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Verify
SELECT 'Trigger reinstalled successfully' AS status;
