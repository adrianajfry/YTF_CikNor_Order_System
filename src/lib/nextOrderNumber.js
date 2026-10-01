export async function getNextOrderNumber(supabase) {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .gte('created_at', startOfDay.toISOString())
    .order('order_number', { ascending: false })
    .limit(1)
  return (data?.[0]?.order_number ?? 0) + 1
}