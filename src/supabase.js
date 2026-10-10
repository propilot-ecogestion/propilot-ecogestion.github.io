import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://amgqazotopxgfxgxtweo.supabase.co'

const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_YDMLSvnySBgKHkuu5EzC_A_Oay-LLPX'

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Configuration Supabase manquante.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
