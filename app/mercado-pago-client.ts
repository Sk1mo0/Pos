export async function paymentRequest<T>(action: string, business: string, body: object): Promise<T> {
  const response = await fetch(`/api/mercadopago/${action}?business=${business}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}
