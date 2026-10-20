// Keep public Actions logs free of registration tokens and SDK error messages.
export function deliveryCode(error) {
  const code=error?.errorInfo?.code||error?.code||'';
  if (['messaging/registration-token-not-registered','messaging/invalid-registration-token','NotRegistered','UNREGISTERED'].includes(code)) return 'expired';
  return 'failed';
}

export async function deliverToDevices({tokens,send,remove}) {
  const result={attempted:tokens.length,sent:0,expired:0,failed:0};
  for (const token of tokens) {
    try { await send(token); result.sent++; }
    catch (error) {
      if (deliveryCode(error)==='expired') {
        result.expired++;
        try { await remove(token); } catch { result.failed++; }
      } else result.failed++;
    }
  }
  return result;
}
