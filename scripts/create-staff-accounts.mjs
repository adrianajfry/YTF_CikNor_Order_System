// One-time setup script: creates the 5 staff login accounts and
// links each to a role in the `staff` table.
//
// Run locally only — never ship the service role key to the browser.
//   node --env-file=.env.script scripts/create-staff-accounts.mjs
//
// Requires Node 20.6+ (for --env-file). On older Node, just export
// the three variables in your shell instead.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const domain = process.env.STAFF_EMAIL_DOMAIN || 'ycntf.internal'

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see .env.script.example).')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

// Edit the passwords (and usernames, if you like) before running.
// Staff will log in with just the username — the @domain part is
// added automatically behind the scenes.
const accounts = [
  { username: 'ytf_counter', password: 'ciknor_counter', role: 'ytf_counter', display_name: 'YTF counter' },
  { username: 'cashier',     password: 'ciknor_cashier', role: 'cashier',     display_name: 'Cashier' },
  { username: 'ytf',      password: 'ciknor_ytf', role: 'ytf',      display_name: 'Yong Tau Foo station' },
  { username: 'beverage', password: 'ciknor_drink', role: 'beverage', display_name: 'Beverage station' },
  { username: 'hotfood',  password: 'ciknor_food', role: 'hotfood',  display_name: 'Hot food station' },
  { username: 'pickup',   password: 'ciknor_pickup', role: 'pickup',   display_name: 'Pickup counter' },
  { username: 'ytf_camera', password: 'ciknor_camera', role: 'ytf_camera', display_name: 'YTF camera' },
]

for (const account of accounts) {
  const email = `${account.username}@${domain}`

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: account.password,
    email_confirm: true,
  })

  if (error) {
    console.error(`Failed to create "${account.username}": ${error.message}`)
    continue
  }

  const { error: staffError } = await supabase
    .from('staff')
    .insert({ id: data.user.id, role: account.role, display_name: account.display_name })

  if (staffError) {
    console.error(`Created the login for "${account.username}" but failed to save its role: ${staffError.message}`)
  } else {
    console.log(`Created "${account.username}" (logs in as ${email}) with role "${account.role}".`)
  }
}
