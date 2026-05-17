import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const id = 'cardiovascular-foundations-st-elevation-myocardial-infarction-inferior-stemi-0'

// Step 1: basic row check
const { data: rows, count } = await supabase
  .from('cases')
  .select('id, is_generated, case_data, created_at', { count: 'exact' })
  .eq('id', id)
console.log('row count:', count, '| is_generated:', rows?.[0]?.is_generated, '| has case_data:', !!rows?.[0]?.case_data)

// Step 2: exact query that lookup route uses (without .single() first)
const { data: multi, error: e2 } = await supabase
  .from('cases')
  .select('case_data, is_generated, imaging_cache, verified_images')
  .eq('id', id)
console.log('select (array):', { rowCount: multi?.length, error: e2?.message })

// Step 3: with .single()
const { data: single, error: e3 } = await supabase
  .from('cases')
  .select('case_data, is_generated, imaging_cache, verified_images')
  .eq('id', id)
  .single()
console.log('select (.single()):', { ok: !!single, error: e3?.message, code: e3?.code })
