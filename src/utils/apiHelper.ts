export async function safeFetchJson(url: string, options?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err: any) {
    const netErr: any = new Error('Network connection error. Please check your connection and try again.');
    netErr.status = 0;
    throw netErr;
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    if (!res.ok) {
      const parseErr: any = new Error(`The server had a problem (status ${res.status}). Try again in a moment.`);
      parseErr.status = res.status;
      parseErr.text = text;
      throw parseErr;
    }
    const parseErr2: any = new Error('The server returned an invalid response. Please try again.');
    parseErr2.status = res.status;
    parseErr2.text = text;
    throw parseErr2;
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `The server had a problem (status ${res.status}). Try again in a moment.`;
    const err: any = new Error(errorMsg);
    err.status = res.status;
    err.json = data;
    throw err;
  }

  return data;
}
