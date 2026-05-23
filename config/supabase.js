const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env');
}

// Create a single supabase client for interacting with your database
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

const testSupabaseConnection = async () => {
  if (!supabaseUrl || !supabaseKey) return;
  try {
    const { data, error } = await supabase.storage.getBucket('uploads');
    if (error) {
      console.error('❌ Supabase Storage Error: Could not connect to bucket "uploads". Check your credentials or bucket name.', error.message);
    } else {
      console.log('✅ Supabase Storage Connected: Bucket "uploads" is ready.');
    }
  } catch (err) {
    console.error('❌ Supabase Storage Connection Failed:', err.message);
  }
};

module.exports = { supabase, testSupabaseConnection };
