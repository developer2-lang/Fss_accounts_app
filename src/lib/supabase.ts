import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_2_URL || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_2_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project') && !supabaseUrl.includes('placeholder')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface SupabaseSyncStatus {
  configured: boolean;
  connected: boolean;
  lastSynced: string | null;
  error?: string | null;
}

export const STATE_CODE_TO_NAME: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh',
  '38': 'Ladakh', '97': 'Other territory', '99': 'Outside India (export / import)'
};

export const STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_CODE_TO_NAME).map(([code, name]) => [name.toLowerCase(), code])
);

let _categoryLookupsCache: {
  types: any[];
  summaryBuckets: any[];
  groups: any[];
  linkedTo: any[];
  natures: any[];
  tdsSections: any[];
  inputGstOnBills?: any[];
} | null = null;

const PROJECT_COST_MONTH_COLS = [
  'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
  'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
];

/** FY-to-date for a project cost row = sum of month columns that fall inside the current financial year (Apr onwards). */
function projectCostFyToDate(row: any): number {
  const sum = PROJECT_COST_MONTH_COLS.reduce((acc: number, m: string) => {
    const v = Number(row?.[m]);
    if (isNaN(v) || v == null) return acc;
    const inFy = String(m) >= 'apr_26';
    return inFy ? acc + v : acc;
  }, 0);
  return Math.round(sum * 100) / 100;
}

/** Recompute fy_to_date (FY-to-date) and shares (share of total) for a list of fss_outflow_project_cost rows. */
function recomputeProjectCostFyAndShares(rows: any[]): any[] {
  const norm = (s: string) => (s || '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  const isGroupRow = (r: any) => Boolean(r?.isGroup) || norm(r?.category) === 'project costs';
  const subRows = (rows || []).filter((r: any) => !isGroupRow(r));

  let groupRow = (rows || []).find((r: any) => isGroupRow(r));
  if (!groupRow) {
    groupRow = { category: 'Project costs', isGroup: true };
  }
  const updatedGroup: Record<string, any> = { ...groupRow, category: groupRow.category || 'Project costs', isGroup: true };

  for (const m of PROJECT_COST_MONTH_COLS) {
    if (['jan_26', 'feb_26', 'mar_26'].includes(m)) {
      const anyVal = subRows.some((r: any) => r[m] !== null && r[m] !== undefined && !isNaN(Number(r[m])));
      if (anyVal) {
        updatedGroup[m] = Math.round(subRows.reduce((acc: number, r: any) => acc + (Number(r[m]) || 0), 0) * 100) / 100;
      } else {
        updatedGroup[m] = null;
      }
    } else {
      const sum = subRows.reduce((acc: number, r: any) => {
        const v = Number(r[m]);
        return acc + (!isNaN(v) && v != null ? v : 0);
      }, 0);
      updatedGroup[m] = Math.round(sum * 100) / 100;
    }
  }

  const groupFy = PROJECT_COST_MONTH_COLS.reduce((acc: number, m: string) => {
    if (String(m) >= 'apr_26') {
      const v = Number(updatedGroup[m]);
      return acc + (!isNaN(v) && v != null ? v : 0);
    }
    return acc;
  }, 0);
  updatedGroup.fy_to_date = Math.round(groupFy * 100) / 100;
  updatedGroup.shares = 100;

  const total = updatedGroup.fy_to_date;
  const updatedSubs = subRows.map((r: any) => {
    const fy = projectCostFyToDate(r);
    return {
      ...r,
      fy_to_date: fy,
      shares: total > 0 ? Math.round(((Number(fy) || 0) / total) * 1000) / 10 : 0
    };
  });

  return [updatedGroup, ...updatedSubs];
}

const CAPEX_MONTH_COLS = [
  'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
  'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
];

/** FY-to-date for a Capex row = sum of month columns that fall inside the current financial year (Apr onwards). */
function capexFyToDate(row: any): number {
  const sum = CAPEX_MONTH_COLS.reduce((acc: number, m: string) => {
    const v = Number(row?.[m]);
    if (isNaN(v) || v == null) return acc;
    const inFy = String(m) >= 'apr_26';
    return inFy ? acc + v : acc;
  }, 0);
  return Math.round(sum * 100) / 100;
}

/** Recompute fy_to_date (FY-to-date) and shares (share of total) for a list of fss_outflow_capex rows. */
function recomputeCapexFyAndShares(rows: any[]): any[] {
  const withFy = (rows || []).map((r: any) => ({ ...r, fy_to_date: capexFyToDate(r) }));
  const isGroupRow = (r: any) => Boolean(r?.isGroup) || String(r?.category || '').trim().toLowerCase() === 'capex';
  const subTotal = withFy.filter((r: any) => !isGroupRow(r)).reduce((s: number, r: any) => s + (Number(r.fy_to_date) || 0), 0);
  const total = subTotal > 0 ? subTotal : withFy.reduce((s: number, r: any) => s + (Number(r.fy_to_date) || 0), 0);
  const out = withFy.map((r: any) => ({
    ...r,
    fy_to_date: r.fy_to_date,
    shares: isGroupRow(r) ? 100 : (total > 0 ? Math.round(((Number(r.fy_to_date) || 0) / total) * 1000) / 10 : 0)
  }));
  return out;
}

const FINANCING_OWNER_MONTH_COLS = [
  'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
  'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
];

/** FY-to-date for a Financing & owner row = sum of month columns that fall inside the current financial year (Apr onwards). */
function financingOwnerFyToDate(row: any): number {
  const sum = FINANCING_OWNER_MONTH_COLS.reduce((acc: number, m: string) => {
    const v = Number(row?.[m]);
    if (isNaN(v) || v == null) return acc;
    const inFy = String(m) >= 'apr_26';
    return inFy ? acc + v : acc;
  }, 0);
  return Math.round(sum * 100) / 100;
}

/** Recompute fy_to_date (FY-to-date) and shares (share of total) for a list of fss_outflow_financing_and_owner rows. */
function recomputeFinancingOwnerFyAndShares(rows: any[]): any[] {
  const withFy = (rows || []).map((r: any) => ({ ...r, fy_to_date: financingOwnerFyToDate(r) }));
  const isGroupRow = (r: any) => Boolean(r?.isGroup) || String(r?.category || '').trim().toLowerCase() === 'financing & owner';
  const subTotal = withFy.filter((r: any) => !isGroupRow(r)).reduce((s: number, r: any) => s + (Number(r.fy_to_date) || 0), 0);
  const total = subTotal > 0 ? subTotal : withFy.reduce((s: number, r: any) => s + (Number(r.fy_to_date) || 0), 0);
  const out = withFy.map((r: any) => ({
    ...r,
    fy_to_date: r.fy_to_date,
    shares: isGroupRow(r) ? 100 : (total > 0 ? Math.round(((Number(r.fy_to_date) || 0) / total) * 1000) / 10 : 0)
  }));
  return out;
}

const TAX_STATUTORY_MONTH_COLS = [
  'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
  'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
];

/** FY-to-date for a Tax & Statutory row = sum of month columns that fall inside the current financial year (Apr onwards). */
function taxStatutoryFyToDate(row: any): number {
  const sum = TAX_STATUTORY_MONTH_COLS.reduce((acc: number, m: string) => {
    const v = Number(row?.[m]);
    if (isNaN(v) || v == null) return acc;
    const inFy = String(m) >= 'apr_26';
    return inFy ? acc + v : acc;
  }, 0);
  return Math.round(sum * 100) / 100;
}

/** Recompute fy_to_date and shares for fss_outflow_tax_statutory rows. */
function recomputeTaxStatutoryFyAndShares(rows: any[]): any[] {
  const isGroupRow = (r: any) => Boolean(r?.isGroup) || String(r?.category || '').trim().toLowerCase() === 'tax & statutory';
  const subRows = (rows || []).filter((r: any) => !isGroupRow(r));

  let groupRow = (rows || []).find((r: any) => isGroupRow(r));
  if (!groupRow) {
    groupRow = { category: 'Tax & statutory', isGroup: true };
  }
  const updatedGroup: Record<string, any> = { ...groupRow, category: groupRow.category || 'Tax & statutory', isGroup: true };

  for (const m of TAX_STATUTORY_MONTH_COLS) {
    if (['jan_26', 'feb_26', 'mar_26'].includes(m)) {
      const anyVal = subRows.some((r: any) => r[m] !== null && r[m] !== undefined && !isNaN(Number(r[m])));
      if (anyVal) {
        updatedGroup[m] = Math.round(subRows.reduce((acc: number, r: any) => acc + (Number(r[m]) || 0), 0) * 100) / 100;
      } else {
        updatedGroup[m] = null;
      }
    } else {
      const sum = subRows.reduce((acc: number, r: any) => acc + (Number(r[m]) || 0), 0);
      updatedGroup[m] = Math.round(sum * 100) / 100;
    }
  }

  const allWithGroup = [updatedGroup, ...subRows];
  const withFy = allWithGroup.map((r: any) => ({ ...r, fy_to_date: taxStatutoryFyToDate(r) }));

  const subTotal = withFy.filter((r: any) => !isGroupRow(r)).reduce((s: number, r: any) => s + (Number(r.fy_to_date) || 0), 0);
  const total = subTotal > 0 ? subTotal : withFy.reduce((s: number, r: any) => s + (Number(r.fy_to_date) || 0), 0);

  return withFy.map((r: any) => ({
    ...r,
    fy_to_date: r.fy_to_date,
    shares: isGroupRow(r) ? 100 : (total > 0 ? Math.round(((Number(r.fy_to_date) || 0) / total) * 1000) / 10 : 0)
  }));
}

const OFFICE_FIXED_MONTH_COLS = [
  'jan26', 'feb26', 'mar26', 'apr26', 'may26', 'jun26',
  'july26', 'aug26', 'sept26', 'oct26', 'nov26', 'dec26'
];
const TRAVEL_TABLE = 'fss_outflow_travel';
const TRAVEL_DB_MONTH_COLS: Record<string, string> = {
  jan26: 'jan', feb26: 'feb', mar26: 'mar', apr26: 'apr', may26: 'may', jun26: 'jun',
  july26: 'jul', aug26: 'aug', sept26: 'sep', oct26: 'oct', nov26: 'nov', dec26: 'dec'
};

function travelUiRowFromSupabase(row: any): any {
  const uiRow: Record<string, any> = {
    ...row,
    category: row.category_name ?? row.category,
    share: row.shares ?? row.share
  };
  for (const [uiMonth, dbMonth] of Object.entries(TRAVEL_DB_MONTH_COLS)) {
    uiRow[uiMonth] = row[dbMonth];
  }
  return uiRow;
}

/** FY-to-date for an Office Fixed row = sum of month columns that fall inside the current financial year (Apr onwards). */
function officeFixedFyToDate(row: any): number {
  const colMap: Record<string, string> = {
    jan26: 'jan_26', feb26: 'feb_26', mar26: 'mar_26', apr26: 'apr_26',
    may26: 'may_26', jun26: 'jun_26', july26: 'jul_26', aug26: 'aug_26',
    sept26: 'sep_26', oct26: 'oct_26', nov26: 'nov_26', dec26: 'dec_26'
  };
  const sum = OFFICE_FIXED_MONTH_COLS.reduce((acc: number, m: string) => {
    const v = Number(row?.[m]);
    if (isNaN(v) || v == null) return acc;
    const uiCol = colMap[m] || m;
    const inFy = uiCol >= 'apr_26';
    return inFy ? acc + v : acc;
  }, 0);
  return Math.round(sum * 100) / 100;
}

/** Recompute fy_to_date and share for office fixed rows. */
function recomputeOfficeFixedFyAndShares(rows: any[]): any[] {
  const withFy = (rows || []).map((r: any) => ({ ...r, fy_to_date: officeFixedFyToDate(r) }));
  const isGroupRow = (r: any) => Boolean(r?.isGroup) || String(r?.expense_name || r?.category || '').trim().toLowerCase() === 'office fixed total';
  const subTotal = withFy.filter((r: any) => !isGroupRow(r)).reduce((s: number, r: any) => s + (Number(r.fy_to_date) || 0), 0);
  const total = subTotal > 0 ? subTotal : withFy.reduce((s: number, r: any) => s + (Number(r.fy_to_date) || 0), 0);
  const out = withFy.map((r: any) => ({
    ...r,
    fy_to_date: r.fy_to_date,
    share: isGroupRow(r) ? 100 : (total > 0 ? Math.round(((Number(r.fy_to_date) || 0) / total) * 1000) / 10 : 0)
  }));
  return out;
}

/** Recompute fy_to_date and share for office variable rows. */
function recomputeOfficeVariableFyAndShares(rows: any[]): any[] {
  const norm = (s: string) => (s || '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  const isGroupRow = (r: any) => Boolean(r?.isGroup) || norm(r?.category || r?.expense_name).includes('total') || norm(r?.category || r?.expense_name) === 'office variable';
  const subRows = (rows || []).filter((r: any) => !isGroupRow(r));

  let groupRow = (rows || []).find((r: any) => isGroupRow(r));
  if (!groupRow) {
    groupRow = { category: 'Office Variable Total', isGroup: true };
  }
  const updatedGroup: Record<string, any> = { ...groupRow, category: groupRow.category || 'Office Variable Total', isGroup: true };

  for (const m of OFFICE_FIXED_MONTH_COLS) {
    if (['jan26', 'feb26', 'mar26'].includes(m)) {
      const anyVal = subRows.some((r: any) => r[m] !== null && r[m] !== undefined && !isNaN(Number(r[m])));
      if (anyVal) {
        updatedGroup[m] = Math.round(subRows.reduce((acc: number, r: any) => acc + (Number(r[m]) || 0), 0) * 100) / 100;
      } else {
        updatedGroup[m] = null;
      }
    } else {
      const sum = subRows.reduce((acc: number, r: any) => {
        const v = Number(r[m]);
        return acc + (!isNaN(v) && v != null ? v : 0);
      }, 0);
      updatedGroup[m] = Math.round(sum * 100) / 100;
    }
  }

  const groupFy = OFFICE_FIXED_MONTH_COLS.reduce((acc: number, m: string) => {
    if (!['jan26', 'feb26', 'mar26'].includes(m)) {
      const v = Number(updatedGroup[m]);
      return acc + (!isNaN(v) && v != null ? v : 0);
    }
    return acc;
  }, 0);
  updatedGroup.fy_to_date = Math.round(groupFy * 100) / 100;
  updatedGroup.share = 100;

  const total = updatedGroup.fy_to_date;
  const updatedSubs = subRows.map((r: any) => {
    const fy = OFFICE_FIXED_MONTH_COLS.reduce((acc: number, m: string) => {
      if (!['jan26', 'feb26', 'mar26'].includes(m)) {
        const v = Number(r[m]);
        return acc + (!isNaN(v) && v != null ? v : 0);
      }
      return acc;
    }, 0);
    const cleanFy = Math.round(fy * 100) / 100;
    return {
      ...r,
      fy_to_date: cleanFy,
      share: total > 0 ? Math.round(((cleanFy || 0) / total) * 1000) / 10 : 0
    };
  });

  return [updatedGroup, ...updatedSubs];
}

/** Recompute fy_to_date and share for travel rows. */
function recomputeTravelFyAndShares(rows: any[]): any[] {
  const normalize = (value: any) => String(value || '').trim().toLowerCase();
  const isGroupRow = (row: any) =>
    Boolean(row?.isGroup) ||
    normalize(row?.category).includes('total') ||
    normalize(row?.category) === 'travel';
  const sourceRows = rows || [];
  const groupRow = sourceRows.find(isGroupRow) || { category: 'Travel Total' };
  const childRows = sourceRows.filter((row: any) => !isGroupRow(row));
  const updatedGroup: Record<string, any> = {
    ...groupRow,
    category: groupRow.category || 'Travel Total'
  };

  for (const month of OFFICE_FIXED_MONTH_COLS) {
    const values = childRows.map((row: any) => row?.[month]);
    if (['jan26', 'feb26', 'mar26'].includes(month) && values.every(value => value == null)) {
      updatedGroup[month] = null;
    } else {
      updatedGroup[month] = Math.round(values.reduce((sum: number, value: any) =>
        sum + (Number(value) || 0), 0) * 100) / 100;
    }
  }

  const groupFy = OFFICE_FIXED_MONTH_COLS
    .filter(month => !['jan26', 'feb26', 'mar26'].includes(month))
    .reduce((sum: number, month: string) => sum + (Number(updatedGroup[month]) || 0), 0);
  updatedGroup.fy_to_date = Math.round(groupFy * 100) / 100;
  updatedGroup.share = 100;

  const updatedChildren = childRows.map((row: any) => {
    const fyToDate = OFFICE_FIXED_MONTH_COLS
      .filter(month => !['jan26', 'feb26', 'mar26'].includes(month))
      .reduce((sum: number, month: string) => sum + (Number(row?.[month]) || 0), 0);
    const cleanFyToDate = Math.round(fyToDate * 100) / 100;
    return {
      ...row,
      fy_to_date: cleanFyToDate,
      share: groupFy > 0 ? Math.round((cleanFyToDate / groupFy) * 1000) / 10 : 0
    };
  });

  return [updatedGroup, ...updatedChildren];
}

/** Recompute fy_to_date and share for professional & admin rows. */
function recomputeProfessionalAdminFyAndShares(rows: any[]): any[] {
  const normalize = (value: any) => String(value || '').trim().toLowerCase();
  const isGroupRow = (row: any) =>
    Boolean(row?.isGroup) ||
    normalize(row?.category).includes('total') ||
    normalize(row?.category) === 'professional & admin';
  const sourceRows = rows || [];
  const groupRow = sourceRows.find(isGroupRow) || { category: 'Professional & Admin Total' };
  const childRows = sourceRows.filter((row: any) => !isGroupRow(row));
  const updatedGroup: Record<string, any> = {
    ...groupRow,
    category: groupRow.category || 'Professional & Admin Total'
  };

  for (const month of OFFICE_FIXED_MONTH_COLS) {
    const values = childRows.map((row: any) => row?.[month]);
    if (['jan26', 'feb26', 'mar26'].includes(month) && values.every(value => value == null)) {
      updatedGroup[month] = null;
    } else {
      updatedGroup[month] = Math.round(values.reduce((sum: number, value: any) =>
        sum + (Number(value) || 0), 0) * 100) / 100;
    }
  }

  const fyMonths = OFFICE_FIXED_MONTH_COLS.filter(month => !['jan26', 'feb26', 'mar26'].includes(month));
  const groupFy = fyMonths.reduce((sum: number, month: string) => sum + (Number(updatedGroup[month]) || 0), 0);
  updatedGroup.fy_to_date = Math.round(groupFy * 100) / 100;
  updatedGroup.share = 100;

  const updatedChildren = childRows.map((row: any) => {
    const fyToDate = fyMonths.reduce((sum: number, month: string) => sum + (Number(row?.[month]) || 0), 0);
    const cleanFyToDate = Math.round(fyToDate * 100) / 100;
    return {
      ...row,
      fy_to_date: cleanFyToDate,
      share: groupFy > 0 ? Math.round((cleanFyToDate / groupFy) * 1000) / 10 : 0
    };
  });

  return [updatedGroup, ...updatedChildren];
}

export const SupabaseService = {
  async callPayVendorEdgeFunction(body: Record<string, any>): Promise<any> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Check the VITE_SUPABASE_URL and anon key.');
    const hostname = typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase();
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
      throw new Error('Pay a Vendor is disabled on deployed sites until Supabase Auth and server-side role authorization are implemented.');
    }
    let response: Response;
    try {
      response = await fetch('/api/fss-pay-vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch {
      throw new Error('Could not reach the protected Pay a Vendor development proxy. Start the app with the configured Vite dev server.');
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Pay a Vendor request failed (${response.status}).`);
    return result.data;
  },
  async savePayVendorEntry(payload: Record<string, any>, rowId?: string, idempotencyKey?: string): Promise<any> {
    return this.callPayVendorEdgeFunction({
      operation: rowId ? 'update' : 'insert',
      id: rowId,
      idempotency_key: idempotencyKey,
      data: payload
    });
  },
  async loadPayVendorEntries(id?: string): Promise<any[]> {
    const data = await this.callPayVendorEdgeFunction({ operation: 'select', id });
    return Array.isArray(data) ? data : data ? [data] : [];
  },
  async updatePayVendorEntry(id: string, payload: Record<string, any>): Promise<any> {
    return this.callPayVendorEdgeFunction({ operation: 'update', id, data: payload });
  },
  async deletePayVendorEntry(id: string): Promise<void> {
    await this.callPayVendorEdgeFunction({ operation: 'delete', id });
  },

  async savePayEmployeeEntry(payload: Record<string, any>, rowId?: string): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured. Check the VITE_SUPABASE_URL and anon key.');

    const result = rowId
      ? await supabase
        .from('fss_form_pay_an_employee')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', rowId)
        .select()
        .single()
      : await supabase
        .from('fss_form_pay_an_employee')
        .insert(payload)
        .select()
        .single();

    if (result.error) throw result.error;
    return result.data;
  },

  async saveTaxStatutoryEntry(payload: Record<string, any>, rowId?: string): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured. Check the VITE_SUPABASE_URL and anon key.');
    const result = rowId
      ? await supabase.from('fss_form_tax_statutory')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', rowId).select().single()
      : await supabase.from('fss_form_tax_statutory').insert(payload).select().single();
    if (result.error) throw result.error;
    return result.data;
  },

  async loadTaxStatutoryEntries(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('fss_form_tax_statutory').select('*').order('payment_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async deleteTaxStatutoryEntry(rowId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('fss_form_tax_statutory').delete().eq('id', rowId);
    if (error) throw error;
  },

  async saveOtherExpenseEntry(payload: Record<string, any>, rowId?: string): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured. Check the VITE_SUPABASE_URL and anon key.');
    const result = rowId
      ? await supabase.from('fss_form_other_expense')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', rowId).select().single()
      : await supabase.from('fss_form_other_expense').insert(payload).select().single();
    if (result.error) throw result.error;
    return result.data;
  },

  async loadOtherExpenseEntries(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('fss_form_other_expense').select('*').order('payment_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async deleteOtherExpenseEntry(rowId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('fss_form_other_expense').delete().eq('id', rowId);
    if (error) throw error;
  },

  async saveClientPaymentEntry(payload: Record<string, any>, rowId?: string): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured. Check the VITE_SUPABASE_URL and anon key.');
    const result = rowId
      ? await supabase.from('fss_form_client_payment')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', rowId).select().single()
      : await supabase.from('fss_form_client_payment').insert(payload).select().single();
    if (result.error) throw result.error;
    return result.data;
  },

  async loadClientPaymentEntries(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('fss_form_client_payment').select('*').order('payment_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async deleteClientPaymentEntry(rowId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('fss_form_client_payment').delete().eq('id', rowId);
    if (error) throw error;
  },

  async uploadOtherIncomeAttachments(files: File[]): Promise<string[]> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const paths: string[] = [];
    for (const file of files || []) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${globalThis.crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage.from('fss-other-income').upload(path, file, {
        upsert: false,
        contentType: file.type || undefined
      });
      if (error) throw error;
      paths.push(path);
    }
    return paths;
  },

  async deleteOtherIncomeAttachments(paths: string[]): Promise<void> {
    if (!supabase || !paths.length) return;
    const { error } = await supabase.storage.from('fss-other-income').remove(paths);
    if (error) throw error;
  },

  async saveOtherIncomeEntry(payload: Record<string, any>, rowId?: string): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured. Check the VITE_SUPABASE_URL and anon key.');
    const result = rowId
      ? await supabase.from('fss_form_other_income')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', rowId).select().single()
      : await supabase.from('fss_form_other_income').insert(payload).select().single();
    if (result.error) throw result.error;
    return result.data;
  },

  async loadOtherIncomeEntries(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('fss_form_other_income').select('*').order('payment_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async deleteOtherIncomeEntry(rowId: string): Promise<void> {
    if (!supabase) return;
    const { data: row, error: loadError } = await supabase.from('fss_form_other_income').select('attachment_paths').eq('id', rowId).maybeSingle();
    if (loadError) throw loadError;
    const paths = Array.isArray(row?.attachment_paths) ? row.attachment_paths : [];
    if (paths.length) await this.deleteOtherIncomeAttachments(paths);
    const { error } = await supabase.from('fss_form_other_income').delete().eq('id', rowId);
    if (error) throw error;
  },
  isConfigured(): boolean {
    return isSupabaseConfigured;
  },

  /**
   * Test connection directly against the fss_client table
   */
  async testConnection(): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { error } = await supabase.from('fss_client').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Saves a client record to fss_client and links contact people in fss_client_people.
   * Handles both new client insertion and updating existing client records.
   */
  async saveClient(
    companyData: any,
    peopleArray: any[] = [],
    taxData: any = {}
  ): Promise<{ client: any; people: any[] }> {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
    }

    const stateName =
      companyData.state ||
      (companyData.stateCode ? (STATE_CODE_TO_NAME[companyData.stateCode] || companyData.stateCode) : null);

    const clientPayload: Record<string, any> = {
      client_name: (companyData.client_name || companyData.name || '').trim(),
      gstin: (companyData.gstin || '').trim() || null,
      state: stateName || null,
      billing_address: (companyData.billing_address || companyData.address || '').trim() || null,
      pin_code: (companyData.pin_code || companyData.pincode || '').trim() || null,
      pan: (taxData.pan || companyData.pan || '').trim() || null,
      tan: (taxData.tan || companyData.tan || '').trim() || null,
      default_gst_type: taxData.default_gst_type || companyData.default_gst_type || (companyData.gstType === 'inter' ? 'IGST' : 'CGST + SGST'),
      credit_period: Number(taxData.credit_period ?? companyData.credit_period ?? companyData.creditDays) || 30,
      notes: (taxData.notes || companyData.notes || '').trim() || null,
      bank_account_name: (taxData.bank_account_name || companyData.bank?.accName || '').trim() || null,
      bank_account_number: (taxData.bank_account_number || companyData.bank?.accNo || '').trim() || null,
      bank_ifsc: (taxData.bank_ifsc || companyData.bank?.ifsc || '').trim() || null,
      bank_name: (taxData.bank_name || companyData.bank?.bankName || '').trim() || null,
      status: companyData.status || (companyData.active === false ? 'Inactive' : 'Active')
    };

    if (!clientPayload.client_name) {
      throw new Error('Client name is required.');
    }

    const existingId = companyData.id;
    const isExistingUuid =
      existingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingId);

    let client: any = null;

    // 1. Update existing record if valid UUID
    if (isExistingUuid) {
      const { data: updated, error: updateErr } = await supabase
        .from('fss_client')
        .update(clientPayload)
        .eq('id', existingId)
        .select()
        .single();

      if (!updateErr && updated) {
        client = updated;
      }
    }

    // 2. Otherwise insert new client row
    if (!client) {
      const { data: inserted, error: insertErr } = await supabase
        .from('fss_client')
        .insert([clientPayload])
        .select()
        .single();

      if (insertErr) {
        console.error('fss_client insert error:', insertErr);
        throw new Error(`Failed to save client: ${insertErr.message}`);
      }
      client = inserted;
    }

    if (!client || !client.id) {
      throw new Error('Client record saved, but no generated ID was returned.');
    }

    let insertedPeople: any[] = [];

    // 3. Sync contact personnel in fss_client_people
    if (isExistingUuid) {
      // Clear previous contacts if updating
      await supabase.from('fss_client_people').delete().eq('client_id', client.id);
    }

    if (peopleArray && peopleArray.length > 0) {
      const peopleToInsert = peopleArray
        .filter((person: any) => person.name?.trim() || person.email?.trim() || person.phone?.trim() || person.designation?.trim())
        .map((person: any) => ({
          client_id: client.id,
          name: person.name ? String(person.name).trim() : null,
          designation: person.designation ? String(person.designation).trim() : null,
          email: person.email ? String(person.email).trim() : null,
          phone: person.phone ? String(person.phone).trim() : null,
          receives_accounts: person.receives_accounts != null ? Boolean(person.receives_accounts) : person.receivesAccounts != null ? Boolean(person.receivesAccounts) : (person.tags || []).includes('accounts'),
          receives_projects: person.receives_projects != null ? Boolean(person.receives_projects) : person.receivesProjects != null ? Boolean(person.receivesProjects) : (person.tags || []).includes('projects'),
          receives_management: person.receives_management != null ? Boolean(person.receives_management) : person.receivesManagement != null ? Boolean(person.receivesManagement) : (person.tags || []).includes('management'),
          on_whatsapp: person.on_whatsapp != null ? Boolean(person.on_whatsapp) : person.whatsapp != null ? Boolean(person.whatsapp) : false
        }));

      if (peopleToInsert.length > 0) {
        const { data: pData, error: peopleError } = await supabase
          .from('fss_client_people')
          .insert(peopleToInsert)
          .select();

        if (peopleError) {
          console.error('fss_client_people insert error:', peopleError);
        } else {
          insertedPeople = pData || [];
        }
      }
    }

    return { client, people: insertedPeople };
  },

  /**
   * Loads all clients from fss_client joined with contacts from fss_client_people
   */
  async loadClientsFromSupabase(): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured; cannot load clients.');
    try {
      const { data: clients, error: clientErr } = await supabase
        .from('fss_client')
        .select('*')
        .order('created_at', { ascending: false });

      if (clientErr) {
        throw new Error(`Failed to load clients from Supabase: ${clientErr.message}`);
      }
      if (!clients || !clients.length) return [];

      const { data: people, error: peopleErr } = await supabase
        .from('fss_client_people')
        .select('*');

      if (peopleErr) throw new Error(`Failed to load client contacts from Supabase: ${peopleErr.message}`);

      const peopleByClient: Record<string, any[]> = {};
      (people || []).forEach((p: any) => {
        if (!peopleByClient[p.client_id]) peopleByClient[p.client_id] = [];
        peopleByClient[p.client_id].push(p);
      });

      return clients.map((c: any) => ({
        ...c,
        people: peopleByClient[c.id] || []
      }));
    } catch (err) {
      console.error('Error in loadClientsFromSupabase:', err);
      throw err;
    }
  },

  /**
   * Deletes a client and their contacts from fss_client and fss_client_people
   */
  async deleteClient(clientId: string): Promise<boolean> {
    if (!supabase || !clientId) return false;
    try {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
        await supabase.from('fss_client_people').delete().eq('client_id', clientId);
        const { error } = await supabase.from('fss_client').delete().eq('id', clientId);
        if (error) {
          console.error('Error deleting client from fss_client:', error.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('Exception deleting client:', err);
      return false;
    }
  },

  /**
   * Syncs local clients into Supabase fss_client if the remote table is empty
   */
  async syncLocalClientsToSupabase(localParties: any[]): Promise<any[]> {
    if (!supabase) return [];
    const clientParties = (localParties || []).filter((p: any) => p.kind === 'client' && p.name?.trim());
    const syncedClients: any[] = [];

    for (const cp of clientParties) {
      try {
        const res = await this.saveClient(cp, cp.contacts || [], {
          pan: cp.pan,
          tan: cp.tan,
          default_gst_type: cp.gstType === 'inter' ? 'IGST' : 'CGST + SGST',
          credit_period: cp.creditDays,
          notes: cp.notes,
          bank_account_name: cp.bank?.accName,
          bank_account_number: cp.bank?.accNo,
          bank_ifsc: cp.bank?.ifsc,
          bank_name: cp.bank?.bankName
        });
        if (res?.client) {
          syncedClients.push(res.client);
        }
      } catch (e) {
        console.warn('Failed to sync client to Supabase:', cp.name, e);
      }
    }
    return syncedClients;
  },

  /**
   * Saves a vendor record to fss_vendor and links contact people in fss_vendor_people.
   * Handles both new vendor insertion and updating existing vendor records.
   */
  async saveVendor(
    vendorData: any,
    peopleArray: any[] = [],
    taxBankData: any = {}
  ): Promise<{ vendor: any; people: any[] }> {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
    }

    const stateName =
      vendorData.state ||
      (vendorData.stateCode ? (STATE_CODE_TO_NAME[vendorData.stateCode] || vendorData.stateCode) : null);

    const vendorPayload: Record<string, any> = {
      vendor_name: (vendorData.vendor_name || vendorData.name || '').trim(),
      gstin: (vendorData.gstin || '').trim() || null,
      state: stateName || null,
      billing_address: (vendorData.billing_address || vendorData.address || '').trim() || null,
      pin_code: (vendorData.pin_code || vendorData.pincode || '').trim() || null,
      pan: (taxBankData.pan || vendorData.pan || '').trim() || null,
      default_gst_type: taxBankData.default_gst_type || vendorData.default_gst_type || (vendorData.gstType === 'inter' ? 'IGST' : 'CGST + SGST'),
      credit_period: Number(taxBankData.credit_period ?? vendorData.credit_period ?? vendorData.creditDays) || 0,
      notes: (taxBankData.notes || vendorData.notes || '').trim() || null,
      account_holder_name: (taxBankData.account_holder_name || vendorData.bank?.accName || '').trim() || null,
      account_number: (taxBankData.account_number || vendorData.bank?.accNo || '').trim() || null,
      bank_name: (taxBankData.bank_name || vendorData.bank?.bankName || '').trim() || null,
      ifsc_code: (taxBankData.ifsc_code || vendorData.bank?.ifsc || '').trim() || null,
      upi_id: (taxBankData.upi_id || vendorData.bank?.upi || '').trim() || null,
      status: vendorData.status || (vendorData.active === false ? 'Inactive' : 'Active')
    };

    if (!vendorPayload.vendor_name) {
      throw new Error('Vendor name is required.');
    }

    const existingId = vendorData.id;
    const isExistingUuid =
      existingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingId);

    let vendor: any = null;

    // 1. Update existing vendor if valid UUID
    if (isExistingUuid) {
      const { data: updated, error: updateErr } = await supabase
        .from('fss_vendor')
        .update(vendorPayload)
        .eq('id', existingId)
        .select()
        .single();

      if (updateErr) throw new Error(`Failed to update vendor: ${updateErr.message}`);
      if (updated) vendor = updated;
    }

    // 2. Otherwise insert new vendor row
    if (!vendor) {
      const { data: inserted, error: insertErr } = await supabase
        .from('fss_vendor')
        .insert([vendorPayload])
        .select()
        .single();

      if (insertErr) {
        console.error('fss_vendor insert error:', insertErr);
        throw new Error(`Failed to save vendor: ${insertErr.message}`);
      }
      vendor = inserted;
    }

    if (!vendor || !vendor.id) {
      throw new Error('Vendor record saved, but no generated ID was returned.');
    }

    let insertedPeople: any[] = [];

    // 3. Sync contact personnel in fss_vendor_people
    if (isExistingUuid) {
      const { error: deletePeopleError } = await supabase.from('fss_vendor_people').delete().eq('vendor_id', vendor.id);
      if (deletePeopleError) throw new Error(`Failed to update vendor contacts: ${deletePeopleError.message}`);
    }

    if (peopleArray && peopleArray.length > 0) {
      const peopleToInsert = peopleArray
        .filter((person: any) => person.name?.trim() || person.email?.trim() || person.phone?.trim() || person.designation?.trim())
        .map((person: any) => ({
          vendor_id: vendor.id,
          name: person.name ? String(person.name).trim() : null,
          designation: person.designation ? String(person.designation).trim() : null,
          email: person.email ? String(person.email).trim() : null,
          phone: person.phone ? String(person.phone).trim() : null,
          receives_accounts: person.receives_accounts != null ? Boolean(person.receives_accounts) : person.receivesAccounts != null ? Boolean(person.receivesAccounts) : (person.tags || []).includes('accounts'),
          receives_projects: person.receives_projects != null ? Boolean(person.receives_projects) : person.receivesProjects != null ? Boolean(person.receivesProjects) : (person.tags || []).includes('projects'),
          receives_management: person.receives_management != null ? Boolean(person.receives_management) : person.receivesManagement != null ? Boolean(person.receivesManagement) : (person.tags || []).includes('management'),
          on_whatsapp: person.on_whatsapp != null ? Boolean(person.on_whatsapp) : person.whatsapp != null ? Boolean(person.whatsapp) : false
        }));

      if (peopleToInsert.length > 0) {
        const { data: pData, error: peopleError } = await supabase
          .from('fss_vendor_people')
          .insert(peopleToInsert)
          .select();

        if (peopleError) {
          console.error('fss_vendor_people insert error:', peopleError);
          throw new Error(`Failed to save vendor contacts: ${peopleError.message}`);
        }
        insertedPeople = pData || [];
      }
    }

    return { vendor, people: insertedPeople };
  },

  /**
   * Loads all vendors from fss_vendor joined with contacts from fss_vendor_people
   */
  async loadVendorsFromSupabase(): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured; cannot load vendors.');
    try {
      const { data: vendors, error: vendorErr } = await supabase
        .from('fss_vendor')
        .select('*')
        .order('created_at', { ascending: false });

      if (vendorErr) {
        console.warn('Error fetching fss_vendor:', vendorErr.message);
        throw new Error(`Failed to load vendors from Supabase: ${vendorErr.message}`);
      }
      if (!vendors || !vendors.length) return [];

      const { data: people, error: peopleErr } = await supabase
        .from('fss_vendor_people')
        .select('*');

      if (peopleErr) {
        throw new Error(`Failed to load vendor contacts from Supabase: ${peopleErr.message}`);
      }

      const peopleByVendor: Record<string, any[]> = {};
      (people || []).forEach((p: any) => {
        if (!peopleByVendor[p.vendor_id]) peopleByVendor[p.vendor_id] = [];
        peopleByVendor[p.vendor_id].push(p);
      });

      return vendors.map((v: any) => ({
        ...v,
        people: peopleByVendor[v.id] || []
      }));
    } catch (err) {
      console.error('Error in loadVendorsFromSupabase:', err);
      throw err;
    }
  },

  /**
   * Deletes a vendor and their contacts from fss_vendor and fss_vendor_people
   */
  async deleteVendor(vendorId: string): Promise<boolean> {
    if (!supabase || !vendorId) return false;
    try {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vendorId)) {
        await supabase.from('fss_vendor_people').delete().eq('vendor_id', vendorId);
        const { error } = await supabase.from('fss_vendor').delete().eq('id', vendorId);
        if (error) {
          console.error('Error deleting vendor from fss_vendor:', error.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('Exception deleting vendor:', err);
      return false;
    }
  },

  /**
   * Syncs local vendors into Supabase fss_vendor if the remote table is empty
   */
  async syncLocalVendorsToSupabase(localParties: any[]): Promise<any[]> {
    if (!supabase) return [];
    const vendorParties = (localParties || []).filter((p: any) => p.kind === 'vendor' && p.name?.trim());
    const syncedVendors: any[] = [];

    for (const vp of vendorParties) {
      try {
        const res = await this.saveVendor(vp, vp.contacts || [], {
          pan: vp.pan,
          default_gst_type: vp.gstType === 'inter' ? 'IGST' : 'CGST + SGST',
          credit_period: vp.creditDays,
          notes: vp.notes,
          account_holder_name: vp.bank?.accName,
          account_number: vp.bank?.accNo,
          bank_name: vp.bank?.bankName,
          ifsc_code: vp.bank?.ifsc,
          upi_id: vp.bank?.upi
        });
        if (res?.vendor) {
          syncedVendors.push(res.vendor);
        }
      } catch (e) {
        console.warn('Failed to sync vendor to Supabase:', vp.name, e);
      }
    }
    return syncedVendors;
  },

  /**
   * Saves an employee record to fss_employe table.
   * Handles both new employee insertion and updating existing employee records.
   */
  async saveEmployee(empData: any): Promise<any> {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
    }

    const name = (empData.name || '').trim();
    if (!name) {
      throw new Error('Employee name is required.');
    }

    const department = (empData.department || '').trim();
    if (!department) {
      throw new Error('Employee department is required.');
    }

    const payload: Record<string, any> = {
      name,
      department,
      designation: (empData.designation || '').trim() || null,
      monthly_salary: Number(empData.monthly_salary ?? empData.monthlySalary) || 0,
      joined: empData.joined || empData.joinDate || null,
      emails: (empData.emails || empData.email || '').trim() || null,
      phone: (empData.phone || '').trim() || null,
      is_active: empData.is_active != null ? Boolean(empData.is_active) : (empData.active != null ? Boolean(empData.active) : true),
      updated_at: new Date().toISOString()
    };

    const existingId = empData.supabase_id || (!isNaN(Number(empData.id)) ? Number(empData.id) : null);

    let employee: any = null;

    // 1. Update existing record if valid numeric ID
    if (existingId) {
      const { data: updated, error: updateErr } = await supabase
        .from('fss_employe')
        .update(payload)
        .eq('id', existingId)
        .select()
        .single();

      if (!updateErr && updated) {
        employee = updated;
      }
    }

    // 2. Otherwise insert new employee row
    if (!employee) {
      const { data: inserted, error: insertErr } = await supabase
        .from('fss_employe')
        .insert([payload])
        .select()
        .single();

      if (insertErr) {
        console.error('fss_employe insert error:', insertErr);
        throw new Error(`Failed to save employee: ${insertErr.message}`);
      }
      employee = inserted;
    }

    if (!employee || !employee.id) {
      throw new Error('Employee record saved, but no generated ID was returned.');
    }

    return employee;
  },

  /**
   * Loads all employees from fss_employe
   */
  async loadEmployeesFromSupabase(): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured; cannot load employees.');
    try {
      const { data: employees, error: empErr } = await supabase
        .from('fss_employe')
        .select('*')
        .order('name', { ascending: true });

      if (empErr) {
        throw new Error(`Failed to load employees from Supabase: ${empErr.message}`);
      }
      return employees || [];
    } catch (err) {
      console.error('Error in loadEmployeesFromSupabase:', err);
      throw err;
    }
  },

  /**
   * Deletes an employee from fss_employe
   */
  async deleteEmployee(employeeId: string | number): Promise<boolean> {
    if (!supabase || !employeeId) return false;
    try {
      const numId = Number(employeeId);
      if (!isNaN(numId)) {
        const { error } = await supabase.from('fss_employe').delete().eq('id', numId);
        if (error) {
          console.error('Error deleting employee from fss_employe:', error.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('Exception deleting employee:', err);
      return false;
    }
  },

  /**
   * Syncs local employees into Supabase fss_employe if the remote table is empty
   */
  async syncLocalEmployeesToSupabase(localParties: any[], departments: any[] = []): Promise<any[]> {
    if (!supabase) return [];
    const empParties = (localParties || []).filter((p: any) => p.kind === 'employee' && p.name?.trim());
    const syncedEmps: any[] = [];

    const deptMap: Record<string, string> = {};
    (departments || []).forEach((d: any) => {
      deptMap[d.id] = d.name;
    });

    for (const ep of empParties) {
      try {
        const deptName = deptMap[ep.departmentId] || ep.department || ep.departmentId || 'Operations / Admin';
        const res = await this.saveEmployee({
          name: ep.name,
          department: deptName,
          designation: ep.designation,
          monthly_salary: ep.monthlySalary,
          joined: ep.joinDate,
          emails: ep.email,
          phone: ep.phone,
          is_active: ep.active !== false
        });
        if (res) {
          ep.supabase_id = res.id;
          syncedEmps.push(res);
        }
      } catch (e) {
        console.warn('Failed to sync employee to Supabase:', ep.name, e);
      }
    }
    return syncedEmps;
  },

  /**
   * Saves or updates an other party in fss_other_parties
   */
  async saveOtherParty(partyData: {
    supabase_id?: number | string | null;
    id?: number | string | null;
    name: string;
    gstin?: string | null;
    default_gst_type?: string | null;
    gstType?: string | null;
    emails?: string | null;
    email?: string | null;
    phone?: string | null;
    is_active?: boolean;
    active?: boolean;
  }): Promise<any> {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please check your .env configuration.');
    }

    if (!partyData.name || !partyData.name.trim()) {
      throw new Error('Other party name is required.');
    }

    let defaultGstType = 'No GST';
    const rawGst = (partyData.default_gst_type || partyData.gstType || '').trim();
    if (['Regular GST', 'intra', 'inter', 'CGST + SGST', 'IGST'].includes(rawGst)) {
      defaultGstType = 'Regular GST';
    } else if (rawGst === 'Composition GST') {
      defaultGstType = 'Composition GST';
    } else if (rawGst === 'Unregistered') {
      defaultGstType = 'Unregistered';
    } else {
      defaultGstType = 'No GST';
    }

    const payload: any = {
      name: partyData.name.trim(),
      gstin: (partyData.gstin || '').trim().toUpperCase() || null,
      default_gst_type: defaultGstType,
      emails: (partyData.emails || partyData.email || '').trim() || null,
      phone: (partyData.phone || '').trim() || null,
      is_active: partyData.is_active != null ? Boolean(partyData.is_active) : (partyData.active != null ? Boolean(partyData.active) : true),
      updated_at: new Date().toISOString()
    };

    const existingId = partyData.supabase_id || (!isNaN(Number(partyData.id)) ? Number(partyData.id) : null);

    let otherParty: any = null;

    // 1. Update existing record if valid numeric ID
    if (existingId) {
      const { data: updated, error: updateErr } = await supabase
        .from('fss_other_parties')
        .update(payload)
        .eq('id', existingId)
        .select()
        .single();

      if (!updateErr && updated) {
        otherParty = updated;
      }
    }

    // 2. Otherwise insert new other party row
    if (!otherParty) {
      const { data: inserted, error: insertErr } = await supabase
        .from('fss_other_parties')
        .insert([payload])
        .select()
        .single();

      if (insertErr) {
        console.error('fss_other_parties insert error:', insertErr);
        throw new Error(`Failed to save other party: ${insertErr.message}`);
      }
      otherParty = inserted;
    }

    if (!otherParty || !otherParty.id) {
      throw new Error('Other party record saved, but no generated ID was returned.');
    }

    return otherParty;
  },

  /**
   * Loads all other parties from fss_other_parties
   */
  async loadOtherPartiesFromSupabase(): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured; cannot load other parties.');
    try {
      const { data: parties, error: partyErr } = await supabase
        .from('fss_other_parties')
        .select('*')
        .order('id', { ascending: true });

      if (partyErr) {
        throw new Error(`Failed to load other parties from Supabase: ${partyErr.message}`);
      }
      return parties || [];
    } catch (err) {
      console.error('Error in loadOtherPartiesFromSupabase:', err);
      throw err;
    }
  },

  /**
   * Deletes an other party from fss_other_parties
   */
  async deleteOtherParty(partyId: string | number): Promise<boolean> {
    if (!supabase || !partyId) return false;
    try {
      const numId = Number(partyId);
      if (!isNaN(numId)) {
        const { error } = await supabase.from('fss_other_parties').delete().eq('id', numId);
        if (error) {
          console.error('Error deleting other party from fss_other_parties:', error.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('Exception deleting other party:', err);
      return false;
    }
  },

  /**
   * Syncs local other parties into Supabase fss_other_parties if the remote table is empty
   */
  async syncLocalOtherPartiesToSupabase(localParties: any[]): Promise<any[]> {
    if (!supabase) return [];
    const otherParties = (localParties || []).filter((p: any) => p.kind === 'other' && p.name?.trim());
    const syncedParties: any[] = [];

    // Check existing records to prevent duplicate insertion
    const { data: existing } = await supabase.from('fss_other_parties').select('id, name');
    const existingNames = new Set((existing || []).map((e: any) => e.name.trim().toLowerCase()));

    for (const op of otherParties) {
      try {
        if (existingNames.has(op.name.trim().toLowerCase())) {
          const match = (existing || []).find((e: any) => e.name.trim().toLowerCase() === op.name.trim().toLowerCase());
          if (match) op.supabase_id = match.id;
          continue;
        }
        const res = await this.saveOtherParty({
          name: op.name,
          gstin: op.gstin,
          default_gst_type: op.gstType,
          emails: op.email,
          phone: op.phone,
          is_active: op.active !== false
        });
        if (res) {
          op.supabase_id = res.id;
          syncedParties.push(res);
          existingNames.add(op.name.trim().toLowerCase());
        }
      } catch (e) {
        console.warn('Failed to sync other party to Supabase:', op.name, e);
      }
    }
    return syncedParties;
  },

  /**
   * Ensures the standard other-party records from the supplied master exist in Supabase.
   */
  async syncSeedOtherPartiesToSupabase(seedParties: any[], localParties: any[] = []): Promise<any[]> {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please check your .env configuration.');
    }

    const { data: existing, error } = await supabase
      .from('fss_other_parties')
      .select('*');
    if (error) throw new Error(`Failed to load other parties before syncing: ${error.message}`);

    const existingByName = new Map(
      (existing || []).map((party: any) => [String(party.name || '').trim().toLowerCase(), party])
    );
    const saved: any[] = [];
    for (const party of seedParties || []) {
      const name = String(party.name || '').trim();
      if (!name) continue;
      const existingParty = existingByName.get(name.toLowerCase());
      const localParty = (localParties || []).find((item: any) =>
        item.kind === 'other' && String(item.name || '').trim().toLowerCase() === name.toLowerCase()
      );
      const record = await this.saveOtherParty({
        supabase_id: existingParty?.id || localParty?.supabase_id,
        name,
        gstin: party.gstin || '',
        default_gst_type: party.gstType || 'none',
        emails: party.email ?? existingParty?.emails ?? localParty?.email ?? '',
        phone: party.phone ?? existingParty?.phone ?? localParty?.phone ?? '',
        is_active: party.active !== false
      });
      saved.push(record);
      existingByName.set(name.toLowerCase(), record);
    }
    return saved;
  },

  /**
   * Saves or updates a project in fss_projects
   */
  async saveProject(
    projectData: {
      supabase_id?: number | string | null;
      id?: number | string | null;
      project_code?: string;
      code?: string;
      project_name?: string;
      name?: string;
      client_id?: number | string;
      clientId?: number | string;
      department?: string;
      departmentId?: string;
      contract_value?: number | null;
      contractValue?: number | null;
      start_date?: string | null;
      startDate?: string | null;
      status?: string;
    },
    clientsList: any[] = []
  ): Promise<any> {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please check your .env configuration.');
    }

    const code = (projectData.project_code || projectData.code || '').trim();
    if (!code) {
      throw new Error('Project code is required.');
    }

    const name = (projectData.project_name || projectData.name || '').trim();
    if (!name) {
      throw new Error('Project name is required.');
    }

    let status = 'Active';
    const rawStatus = (projectData.status || '').toLowerCase().trim();
    if (rawStatus === 'completed') status = 'Completed';
    else if (rawStatus === 'on hold' || rawStatus === 'on-hold') status = 'On Hold';
    else if (rawStatus === 'inactive') status = 'Inactive';
    else status = 'Active';

    // Resolve client_id to positive BIGINT integer
    let clientIdNum = 1;
    const rawClientId = projectData.client_id ?? projectData.clientId;
    if (typeof rawClientId === 'number' && !isNaN(rawClientId) && rawClientId > 0) {
      clientIdNum = rawClientId;
    } else {
      const strId = String(rawClientId || '').trim();
      const parsed = Number(strId);
      if (!isNaN(parsed) && parsed > 0) {
        clientIdNum = parsed;
      } else if (clientsList && clientsList.length > 0) {
        const clientParties = clientsList.filter((c: any) => c.kind === 'client');
        const idx = clientParties.findIndex((c: any) => c.id === strId || c.supabase_id === strId);
        clientIdNum = idx >= 0 ? idx + 1 : 1;
      } else {
        let hash = 0;
        for (let i = 0; i < strId.length; i++) {
          hash = (hash * 31 + strId.charCodeAt(i)) & 0x7fffffff;
        }
        clientIdNum = (hash % 100000) + 1;
      }
    }

    const contractVal = Number(projectData.contract_value ?? projectData.contractValue) || 0;

    const payload: any = {
      project_code: code,
      project_name: name,
      client_id: clientIdNum,
      department: (projectData.department || projectData.departmentId || 'Design').trim(),
      contract_value: contractVal >= 0 ? contractVal : 0,
      start_date: projectData.start_date || projectData.startDate || null,
      status,
      updated_at: new Date().toISOString()
    };

    const existingId = projectData.supabase_id || (!isNaN(Number(projectData.id)) ? Number(projectData.id) : null);
    let project: any = null;

    // 1. Try update by numeric ID
    if (existingId) {
      const { data: updated, error: updateErr } = await supabase
        .from('fss_projects')
        .update(payload)
        .eq('id', existingId)
        .select()
        .single();

      if (!updateErr && updated) {
        project = updated;
      }
    }

    // 2. Try update by unique project_code
    if (!project && payload.project_code) {
      const { data: updatedByCode, error: updateCodeErr } = await supabase
        .from('fss_projects')
        .update(payload)
        .eq('project_code', payload.project_code)
        .select()
        .single();

      if (!updateCodeErr && updatedByCode) {
        project = updatedByCode;
      }
    }

    // 3. Otherwise insert new project
    if (!project) {
      const { data: inserted, error: insertErr } = await supabase
        .from('fss_projects')
        .insert([payload])
        .select()
        .single();

      if (insertErr) {
        console.error('fss_projects insert error:', insertErr);
        throw new Error(`Failed to save project: ${insertErr.message}`);
      }
      project = inserted;
    }

    if (!project || !project.id) {
      throw new Error('Project record saved, but no generated ID was returned.');
    }

    return project;
  },

  /**
   * Loads all projects from fss_projects
   */
  async loadProjectsFromSupabase(): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured; cannot load projects.');
    try {
      const { data: projects, error: projErr } = await supabase
        .from('fss_projects')
        .select('*')
        .order('project_code', { ascending: true });

      if (projErr) {
        throw new Error(`Failed to load projects from Supabase: ${projErr.message}`);
      }
      return projects || [];
    } catch (err) {
      console.error('Error in loadProjectsFromSupabase:', err);
      throw err;
    }
  },

  /**
   * Deletes a project from fss_projects by id or project_code
   */
  async deleteProject(projectIdOrCode: string | number): Promise<boolean> {
    if (!supabase || !projectIdOrCode) return false;
    try {
      const numId = Number(projectIdOrCode);
      if (!isNaN(numId)) {
        const { error } = await supabase.from('fss_projects').delete().eq('id', numId);
        if (error) {
          console.error('Error deleting project from fss_projects by id:', error.message);
          return false;
        }
      } else {
        const { error } = await supabase.from('fss_projects').delete().eq('project_code', String(projectIdOrCode));
        if (error) {
          console.error('Error deleting project from fss_projects by code:', error.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('Exception deleting project:', err);
      return false;
    }
  },

  /**
   * Syncs local projects into Supabase fss_projects if the remote table is empty
   */
  async syncLocalProjectsToSupabase(
    localProjects: any[],
    localParties: any[] = [],
    departments: any[] = []
  ): Promise<any[]> {
    if (!supabase) return [];
    const validProjects = (localProjects || []).filter((p: any) => (p.code || p.project_code) && (p.name || p.project_name));
    const syncedProjects: any[] = [];

    // Check existing projects to prevent duplicate insertion
    const { data: existing } = await supabase.from('fss_projects').select('id, project_code');
    const existingCodes = new Set((existing || []).map((e: any) => (e.project_code || '').trim().toLowerCase()));

    const deptMap: Record<string, string> = {};
    (departments || []).forEach((d: any) => {
      deptMap[d.id] = d.name;
    });

    for (const pr of validProjects) {
      try {
        const prCode = (pr.code || pr.project_code || '').trim();
        if (existingCodes.has(prCode.toLowerCase())) {
          const match = (existing || []).find((e: any) => (e.project_code || '').trim().toLowerCase() === prCode.toLowerCase());
          if (match) pr.supabase_id = match.id;
          continue;
        }

        const deptName = deptMap[pr.departmentId] || pr.department || pr.departmentId || 'Design';
        const res = await this.saveProject(
          {
            project_code: prCode,
            project_name: pr.name || pr.project_name,
            client_id: pr.clientId || pr.client_id,
            department: deptName,
            contract_value: pr.contractValue ?? pr.contract_value ?? 0,
            start_date: pr.startDate || pr.start_date || null,
            status: pr.status || 'Active'
          },
          localParties
        );

        if (res) {
          pr.supabase_id = res.id;
          syncedProjects.push(res);
          existingCodes.add(prCode.toLowerCase());
        }
      } catch (e) {
        console.warn('Failed to sync project to Supabase:', pr.code || pr.name, e);
      }
    }
    return syncedProjects;
  },

  /**
   * Replaces the Supabase project master with the supplied canonical project list.
   */
  async replaceProjectMasterFromSeed(
    masterProjects: any[],
    masterClients: any[],
    localParties: any[] = [],
    departments: any[] = []
  ): Promise<any[]> {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please check your .env configuration.');
    }

    const projects = (masterProjects || []).filter((project: any) =>
      (project.code || project.project_code) && (project.name || project.project_name)
    );
    const canonicalCodes = new Set<string>();
    projects.forEach((project: any) => {
      const code = String(project.code || project.project_code).trim().toLowerCase();
      if (canonicalCodes.has(code)) throw new Error(`The canonical project list contains duplicate code "${code}".`);
      canonicalCodes.add(code);
    });

    const { data: existingProjects, error: existingErr } = await supabase
      .from('fss_projects')
      .select('*');
    if (existingErr) throw new Error(`Failed to load projects before replacement: ${existingErr.message}`);

    const existingByCode = new Map<string, any[]>();
    (existingProjects || []).forEach((project: any) => {
      const code = String(project.project_code || '').trim().toLowerCase();
      if (!existingByCode.has(code)) existingByCode.set(code, []);
      existingByCode.get(code)!.push(project);
    });

    const departmentNames = new Map((departments || []).map((department: any) => [department.id, department.name]));
    const savedProjects: any[] = [];
    for (const project of projects) {
      const code = String(project.code || project.project_code).trim();
      const sourceClient = (masterClients || []).find((client: any) => client.id === project.clientId);
      if (!sourceClient) throw new Error(`Project ${code} does not have a client in the canonical client list.`);
      const localClient = (localParties || []).find((party: any) =>
        party.kind === 'client' &&
        String(party.name || '').trim().toLowerCase() === String(sourceClient.name || '').trim().toLowerCase()
      );
      if (!localClient) throw new Error(`Cannot find client "${sourceClient.name}" in the current client master for project ${code}.`);

      const matchedRows = existingByCode.get(code.toLowerCase()) || [];
      const saved = await this.saveProject({
        supabase_id: matchedRows[0]?.id,
        project_code: code,
        project_name: project.name || project.project_name,
        client_id: localClient.id,
        department: departmentNames.get(project.departmentId) || project.departmentId || 'Design',
        contract_value: project.contractValue ?? project.contract_value ?? 0,
        start_date: project.startDate || project.start_date || null,
        status: project.status || 'Active'
      }, localParties);
      savedProjects.push(saved);
    }

    const savedIds = new Set(savedProjects.map((project: any) => String(project.id)));
    for (const project of existingProjects || []) {
      if (savedIds.has(String(project.id))) continue;
      const { error } = await supabase.from('fss_projects').delete().eq('id', project.id);
      if (error) throw new Error(`Failed to delete project "${project.project_code || project.id}": ${error.message}`);
    }

    const { data: reconciledProjects, error: reconcileErr } = await supabase
      .from('fss_projects')
      .select('*')
      .order('project_code', { ascending: true });
    if (reconcileErr) throw new Error(`Failed to verify the replaced project master: ${reconcileErr.message}`);
    const finalCodes = (reconciledProjects || []).map((project: any) => String(project.project_code || '').trim().toLowerCase());
    if (finalCodes.length !== canonicalCodes.size || finalCodes.some((code: string) => !canonicalCodes.has(code))) {
      throw new Error(`Project master replacement verification failed: expected ${canonicalCodes.size} projects, found ${finalCodes.length}.`);
    }
    return reconciledProjects || [];
  },

  /**
   * Saves or updates a department in fss_departments
   */
  async saveDepartment(deptData: {
    supabase_id?: number | string | null;
    id?: number | string | null;
    department_name?: string;
    name?: string;
    manager?: string | null;
    managerName?: string | null;
    manager_email?: string | null;
    managerEmail?: string | null;
  }): Promise<any> {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please check your .env configuration.');
    }

    const deptName = (deptData.department_name || deptData.name || '').trim();
    if (!deptName) {
      throw new Error('Department name is required.');
    }

    const payload: any = {
      department_name: deptName,
      manager: (deptData.manager || deptData.managerName || '').trim() || null,
      manager_email: (deptData.manager_email || deptData.managerEmail || '').trim() || null,
      updated_at: new Date().toISOString()
    };

    const existingId = deptData.supabase_id || (!isNaN(Number(deptData.id)) ? Number(deptData.id) : null);
    let department: any = null;

    // 1. Try update by numeric ID
    if (existingId) {
      const { data: updated, error: updateErr } = await supabase
        .from('fss_departments')
        .update(payload)
        .eq('id', existingId)
        .select()
        .single();

      if (!updateErr && updated) {
        department = updated;
      }
    }

    // 2. Try update by department_name
    if (!department && payload.department_name) {
      const { data: updatedByName, error: updateNameErr } = await supabase
        .from('fss_departments')
        .update(payload)
        .eq('department_name', payload.department_name)
        .select()
        .single();

      if (!updateNameErr && updatedByName) {
        department = updatedByName;
      }
    }

    // 3. Otherwise insert new department
    if (!department) {
      const { data: inserted, error: insertErr } = await supabase
        .from('fss_departments')
        .insert([payload])
        .select()
        .single();

      if (insertErr) {
        console.error('fss_departments insert error:', insertErr);
        throw new Error(`Failed to save department: ${insertErr.message}`);
      }
      department = inserted;
    }

    if (!department || !department.id) {
      throw new Error('Department record saved, but no generated ID was returned.');
    }

    return department;
  },

  /**
   * Loads all departments from fss_departments
   */
  async loadDepartmentsFromSupabase(): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured; cannot load departments.');
    try {
      const { data: depts, error: deptErr } = await supabase
        .from('fss_departments')
        .select('*')
        .order('id', { ascending: true });

      if (deptErr) {
        throw new Error(`Failed to load departments from Supabase: ${deptErr.message}`);
      }
      return depts || [];
    } catch (err) {
      console.error('Error in loadDepartmentsFromSupabase:', err);
      throw err;
    }
  },

  /**
   * Deletes a department from fss_departments by id or department_name
   */
  async deleteDepartment(departmentIdOrName: string | number): Promise<boolean> {
    if (!supabase || !departmentIdOrName) return false;
    try {
      const numId = Number(departmentIdOrName);
      if (!isNaN(numId)) {
        const { error } = await supabase.from('fss_departments').delete().eq('id', numId);
        if (error) {
          console.error('Error deleting department from fss_departments by id:', error.message);
          return false;
        }
      } else {
        const { error } = await supabase.from('fss_departments').delete().eq('department_name', String(departmentIdOrName));
        if (error) {
          console.error('Error deleting department from fss_departments by name:', error.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('Exception deleting department:', err);
      return false;
    }
  },

  /**
   * Syncs local departments into Supabase fss_departments if the remote table is empty
   */
  async syncLocalDepartmentsToSupabase(localDepartments: any[]): Promise<any[]> {
    if (!supabase) return [];
    const validDepts = (localDepartments || []).filter((d: any) => d.name || d.department_name);
    const syncedDepts: any[] = [];

    // Check existing departments to prevent duplicate insertion
    const { data: existing } = await supabase.from('fss_departments').select('id, department_name');
    const existingNames = new Set((existing || []).map((e: any) => (e.department_name || '').trim().toLowerCase()));

    for (const d of validDepts) {
      try {
        const name = (d.name || d.department_name || '').trim();
        if (existingNames.has(name.toLowerCase())) {
          const match = (existing || []).find((e: any) => (e.department_name || '').trim().toLowerCase() === name.toLowerCase());
          if (match) d.supabase_id = match.id;
          continue;
        }

        const res = await this.saveDepartment({
          department_name: name,
          manager: d.managerName || d.manager,
          manager_email: d.managerEmail || d.manager_email
        });

        if (res) {
          d.supabase_id = res.id;
          syncedDepts.push(res);
          existingNames.add(name.toLowerCase());
        }
      } catch (e) {
        console.warn('Failed to sync department to Supabase:', d.name, e);
      }
    }
    return syncedDepts;
  },

  /**
   * Saves or updates a bank account in fss_bank_accounts
   */
  async saveBankAccount(accountData: {
    supabase_id?: number | string | null;
    id?: number | string | null;
    account_name?: string;
    name?: string;
    account_type?: string | null;
    type?: string | null;
    account_number_masked?: string | null;
    number?: string | null;
    opening_balance?: number | string | null;
    openingBalance?: number | string | null;
    opening_balance_date?: string | null;
    openingBalanceDate?: string | null;
  }): Promise<any> {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please check your .env configuration.');
    }

    const accName = (accountData.account_name || accountData.name || '').trim();
    if (!accName) {
      throw new Error('Account name is required.');
    }

    let accType = (accountData.account_type || accountData.type || 'Bank').trim();
    if (accType.toLowerCase() === 'bank') accType = 'Bank';
    else if (accType.toLowerCase() === 'cash') accType = 'Cash';
    else if (accType.toLowerCase() === 'fd' || accType.toLowerCase() === 'fixed deposit') accType = 'Fixed deposit';

    const openingBal = Number(accountData.opening_balance ?? accountData.openingBalance ?? 0);
    const openingDate = (accountData.opening_balance_date || accountData.openingBalanceDate || '2025-04-01').trim();

    const payload: any = {
      account_name: accName,
      account_type: accType,
      account_number_masked: (accountData.account_number_masked || accountData.number || '').trim() || null,
      opening_balance: !isNaN(openingBal) ? openingBal : 0,
      opening_balance_date: openingDate || '2025-04-01',
      updated_at: new Date().toISOString()
    };

    const existingId = accountData.supabase_id || (!isNaN(Number(accountData.id)) ? Number(accountData.id) : null);
    let bankAccount: any = null;

    // 1. Try update by numeric ID
    if (existingId) {
      const { data: updated, error: updateErr } = await supabase
        .from('fss_bank_accounts')
        .update(payload)
        .eq('id', existingId)
        .select()
        .single();

      if (!updateErr && updated) {
        bankAccount = updated;
      }
    }

    // 2. Try update by account_name
    if (!bankAccount && payload.account_name) {
      const { data: updatedByName, error: updateNameErr } = await supabase
        .from('fss_bank_accounts')
        .update(payload)
        .eq('account_name', payload.account_name)
        .select()
        .single();

      if (!updateNameErr && updatedByName) {
        bankAccount = updatedByName;
      }
    }

    // 3. Otherwise insert new bank account
    if (!bankAccount) {
      const { data: inserted, error: insertErr } = await supabase
        .from('fss_bank_accounts')
        .insert([payload])
        .select()
        .single();

      if (insertErr) {
        console.error('fss_bank_accounts insert error:', insertErr);
        throw new Error(`Failed to save bank account: ${insertErr.message}`);
      }
      bankAccount = inserted;
    }

    if (!bankAccount || !bankAccount.id) {
      throw new Error('Bank account record saved, but no generated ID was returned.');
    }

    return bankAccount;
  },

  /**
   * Loads all bank accounts from fss_bank_accounts
   */
  async loadBankAccountsFromSupabase(): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured; cannot load bank accounts.');
    try {
      const { data: accounts, error: accErr } = await supabase
        .from('fss_bank_accounts')
        .select('*')
        .order('id', { ascending: true });

      if (accErr) {
        throw new Error(`Failed to load bank accounts from Supabase: ${accErr.message}`);
      }
      return accounts || [];
    } catch (err) {
      console.error('Error in loadBankAccountsFromSupabase:', err);
      throw err;
    }
  },

  /**
   * Deletes a bank account from fss_bank_accounts by id or account_name
   */
  async deleteBankAccount(accountIdOrName: string | number): Promise<boolean> {
    if (!supabase || !accountIdOrName) return false;
    try {
      const numId = Number(accountIdOrName);
      if (!isNaN(numId)) {
        const { error } = await supabase.from('fss_bank_accounts').delete().eq('id', numId);
        if (error) {
          console.error('Error deleting bank account from fss_bank_accounts by id:', error.message);
          return false;
        }
      } else {
        const { error } = await supabase.from('fss_bank_accounts').delete().eq('account_name', String(accountIdOrName));
        if (error) {
          console.error('Error deleting bank account from fss_bank_accounts by name:', error.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('Exception deleting bank account:', err);
      return false;
    }
  },

  /**
   * Syncs local bank accounts into Supabase fss_bank_accounts if the remote table is empty
   */
  async syncLocalBankAccountsToSupabase(localAccounts: any[]): Promise<any[]> {
    if (!supabase) return [];
    const validAccounts = (localAccounts || []).filter((a: any) => a.name || a.account_name);
    const syncedAccounts: any[] = [];

    // Check existing bank accounts to prevent duplicate insertion
    const { data: existing } = await supabase.from('fss_bank_accounts').select('id, account_name');
    const existingNames = new Set((existing || []).map((e: any) => (e.account_name || '').trim().toLowerCase()));

    for (const a of validAccounts) {
      try {
        const name = (a.name || a.account_name || '').trim();
        if (existingNames.has(name.toLowerCase())) {
          const match = (existing || []).find((e: any) => (e.account_name || '').trim().toLowerCase() === name.toLowerCase());
          if (match) a.supabase_id = match.id;
          continue;
        }

        const res = await this.saveBankAccount({
          account_name: name,
          account_type: a.type,
          account_number_masked: a.number || a.account_number_masked,
          opening_balance: a.openingBalance ?? a.opening_balance ?? 0,
          opening_balance_date: a.openingBalanceDate || a.opening_balance_date || '2025-04-01'
        });

        if (res) {
          a.supabase_id = res.id;
          syncedAccounts.push(res);
          existingNames.add(name.toLowerCase());
        }
      } catch (e) {
        console.warn('Failed to sync bank account to Supabase:', a.name, e);
      }
    }
    return syncedAccounts;
  },

  /**
   * Loads all category lookup tables from Supabase (with in-memory caching and fallbacks)
   */
  async loadCategoryLookups(forceRefresh = false): Promise<{
    types: any[];
    summaryBuckets: any[];
    groups: any[];
    linkedTo: any[];
    natures: any[];
    tdsSections: any[];
    inputGstOnBills?: any[];
  }> {
    if (!forceRefresh && _categoryLookupsCache) {
      return _categoryLookupsCache;
    }

    const defaultLookups = {
      types: [
        { id: 1, name: 'Select' },
        { id: 2, name: 'Outflow' },
        { id: 3, name: 'Inflow' }
      ],
      summaryBuckets: [
        { id: 1, name: 'Operating costs (outflow)', associated_type: 'Outflow' },
        { id: 2, name: 'Project costs (outflow)', associated_type: 'Outflow' },
        { id: 3, name: 'Tax & statutory (outflow)', associated_type: 'Outflow' },
        { id: 4, name: 'Capex (outflow)', associated_type: 'Outflow' },
        { id: 5, name: 'Financing & owner (outflow)', associated_type: 'Outflow' },
        { id: 6, name: 'Operating receipts (inflow)', associated_type: 'Inflow' },
        { id: 7, name: 'Other income (inflow)', associated_type: 'Inflow' },
        { id: 8, name: 'Financing (inflow)', associated_type: 'Inflow' }
      ],
      groups: [
        { id: 1, name: 'People' },
        { id: 2, name: 'Office – Fixed' },
        { id: 3, name: 'Office – Variable' },
        { id: 4, name: 'Travel' },
        { id: 5, name: 'Project Costs' },
        { id: 6, name: 'Professional & Admin' },
        { id: 7, name: 'Capex / Purchases' },
        { id: 8, name: 'Statutory & Tax' },
        { id: 9, name: 'Financing & Owner' },
        { id: 10, name: 'Operating Receipts' },
        { id: 11, name: 'Other Income' },
        { id: 12, name: 'Financing' }
      ],
      linkedTo: [
        { id: 1, name: 'Client' },
        { id: 2, name: 'Vendor' },
        { id: 3, name: 'Employee' },
        { id: 4, name: 'Other' }
      ],
      natures: [
        { id: 1, name: 'Operating' },
        { id: 2, name: 'Statutory / Tax' },
        { id: 3, name: 'Capex' },
        { id: 4, name: 'Financing / Owner' }
      ],
      tdsSections: [
        { id: 1, code: '192', description: 'Salary' },
        { id: 2, code: '194C', description: 'Contractors' },
        { id: 3, code: '194J', description: 'Professional / technical fees' },
        { id: 4, code: '194I', description: 'Rent' },
        { id: 5, code: '194H', description: 'Commission / brokerage' },
        { id: 6, code: '194A', description: 'Interest (other than bank)' }
      ],
      inputGstOnBills: [
        { id: 1, value: 'claimable_itc', label: 'Claimable (ITC)', description: 'Input GST eligible for input tax credit, subject to applicable rules.', is_active: true },
        { id: 2, value: 'blocked_not_claimable', label: 'Blocked · not claimable', description: 'Input GST that is blocked or not eligible for input tax credit.', is_active: true }
      ]
    };

    const exposeWindowLookups = (cache: any) => {
      if (typeof window !== 'undefined' && cache) {
        (window as any).__categoryLookups = cache;
        (window as any).__categoryTypeList = cache.types || [];
        (window as any).__categorySummaryBucketList = cache.summaryBuckets || [];
        (window as any).__categoryGroupList = (cache.groups || []).map((g: any) => g.name);
        (window as any).__categoryLinkedToList = cache.linkedTo || [];
        (window as any).__categoryNatureList = cache.natures || [];
        (window as any).__categoryTdsSectionList = cache.tdsSections || [];
        (window as any).__categoryInputGstOnBillsList = cache.inputGstOnBills || [];
      }
    };

    if (!supabase) {
      _categoryLookupsCache = defaultLookups;
      exposeWindowLookups(defaultLookups);
      return defaultLookups;
    }

    try {
      const [tyRes, bRes, gRes, lRes, nRes, tRes, gstRes] = await Promise.all([
        supabase.from('fss_type').select('*').order('id', { ascending: true }),
        supabase.from('fss_category_summary_bucket').select('*').order('id', { ascending: true }),
        supabase.from('fss_category_group').select('*').order('id', { ascending: true }),
        supabase.from('fss_category_linked_to').select('*').order('id', { ascending: true }),
        supabase.from('fss_category_nature').select('*').order('id', { ascending: true }),
        supabase.from('fss_category_tds_section').select('*').order('id', { ascending: true }),
        supabase.from('fss_category_input_gst_on_bills').select('*').order('id', { ascending: true })
      ]);

      _categoryLookupsCache = {
        types: tyRes.data?.length ? tyRes.data : defaultLookups.types,
        summaryBuckets: bRes.data?.length ? bRes.data : defaultLookups.summaryBuckets,
        groups: gRes.data?.length ? gRes.data : defaultLookups.groups,
        linkedTo: lRes.data?.length ? lRes.data : defaultLookups.linkedTo,
        natures: nRes.data?.length ? nRes.data : defaultLookups.natures,
        tdsSections: tRes.data?.length ? tRes.data : defaultLookups.tdsSections,
        inputGstOnBills: gstRes.data?.length ? gstRes.data : defaultLookups.inputGstOnBills
      };

      exposeWindowLookups(_categoryLookupsCache);

      return _categoryLookupsCache;
    } catch (err) {
      console.error('Error loading category lookups:', err);
      _categoryLookupsCache = defaultLookups;
      exposeWindowLookups(defaultLookups);
      return defaultLookups;
    }
  },

  /**
   * Helper to resolve category foreign key references into Supabase column values
   */
  resolveCategoryPayload(catData: any, lookups: any): any {
    const catName = (catData.category_name || catData.name || '').trim();
    if (!catName) {
      throw new Error('Category name is required.');
    }

    const norm = (s: string) => (s || '').toLowerCase().replace(/[\u2013\u2014\-]/g, '-').trim();

    // 1. Resolve type_id (1: Select, 2: Outflow, 3: Inflow)
    let typeId: number | null = catData.type_id || null;
    if (!typeId) {
      const typeStr = (catData.type || 'outflow').trim().toLowerCase();
      if (typeStr === 'select') {
        throw new Error('Please select a valid Category Type.');
      }
      const matchedType = lookups.types.find((t: any) =>
        t.name.toLowerCase() === typeStr ||
        (typeStr === 'outflow' && t.name.toLowerCase().includes('outflow')) ||
        (typeStr === 'inflow' && t.name.toLowerCase().includes('inflow'))
      );
      if (matchedType) typeId = matchedType.id;
      else typeId = typeStr === 'inflow' ? 3 : 2;
    }
    if (typeId === 1) {
      throw new Error('Please select a valid Category Type.');
    }

    // 2. Resolve summary_bucket_id
    let bucketId: number | null = catData.summary_bucket_id || null;
    const rawBucket = (catData.summary_bucket || catData.bucket || '').trim().toLowerCase();
    if (!bucketId && rawBucket) {
      const matchedB = lookups.summaryBuckets.find((b: any) => {
        const bn = b.name.toLowerCase();
        return bn === rawBucket ||
          bn.includes(rawBucket) ||
          (rawBucket === 'op_cost' && bn.includes('operating costs')) ||
          (rawBucket === 'proj_cost' && bn.includes('project costs')) ||
          (rawBucket === 'tax' && bn.includes('tax & statutory')) ||
          (rawBucket === 'capex' && bn.includes('capex')) ||
          (rawBucket === 'fin_out' && bn.includes('financing & owner')) ||
          (rawBucket === 'op_rec' && bn.includes('operating receipts')) ||
          (rawBucket === 'oth_inc' && bn.includes('other income')) ||
          (rawBucket === 'fin_in' && bn.includes('financing (inflow)'));
      });
      if (matchedB) bucketId = matchedB.id;
    }

    // If still no bucketId, derive from group/kind/type
    if (!bucketId) {
      const typeStr = (catData.type || (typeId === 3 ? 'inflow' : 'outflow')).trim().toLowerCase();
      const kindStr = (catData.nature || catData.kind || 'operating').trim().toLowerCase();
      const groupStr = (catData.group || '').trim().toLowerCase();
      let derivedKey = 'op_cost';
      if (typeStr === 'inflow') {
        derivedKey = (kindStr === 'financing' || kindStr.includes('financing')) ? 'fin_in' : (groupStr === 'other income' ? 'oth_inc' : 'op_rec');
      } else {
        if (groupStr === 'project costs') derivedKey = 'proj_cost';
        else if (kindStr === 'tax' || kindStr.includes('statutory')) derivedKey = 'tax';
        else if (kindStr === 'capex') derivedKey = 'capex';
        else if (kindStr === 'financing' || kindStr.includes('owner')) derivedKey = 'fin_out';
        else derivedKey = 'op_cost';
      }
      const matchedB = lookups.summaryBuckets.find((b: any) => {
        const bn = b.name.toLowerCase();
        return (derivedKey === 'op_cost' && bn.includes('operating costs')) ||
          (derivedKey === 'proj_cost' && bn.includes('project costs')) ||
          (derivedKey === 'tax' && bn.includes('tax & statutory')) ||
          (derivedKey === 'capex' && bn.includes('capex')) ||
          (derivedKey === 'fin_out' && bn.includes('financing & owner')) ||
          (derivedKey === 'op_rec' && bn.includes('operating receipts')) ||
          (derivedKey === 'oth_inc' && bn.includes('other income')) ||
          (derivedKey === 'fin_in' && bn.includes('financing (inflow)'));
      });
      if (matchedB) bucketId = matchedB.id;
    }

    // 3. Resolve group_id
    let groupId: number | null = catData.group_id || null;
    const groupName = (catData.group || '').trim();
    if (!groupId && groupName) {
      const matchedG = lookups.groups.find((g: any) => norm(g.name) === norm(groupName));
      if (matchedG) {
        groupId = matchedG.id;
      }
    }

    // 4. Resolve linked_to_id
    let linkedToId: number | null = catData.linked_to_id || null;
    if (!linkedToId) {
      const partyKind = (catData.linked_to || catData.partyKind || 'vendor').trim().toLowerCase();
      const matchedL = lookups.linkedTo.find((l: any) => {
        const ln = l.name.toLowerCase();
        return ln === partyKind ||
          (partyKind === 'client' && ln === 'client') ||
          (partyKind === 'vendor' && ln === 'vendor') ||
          (partyKind === 'employee' && ln === 'employee') ||
          (partyKind === 'other' && ln === 'other');
      });
      if (matchedL) linkedToId = matchedL.id;
      else linkedToId = 2; // fallback to Vendor
    }

    // 5. Resolve nature_id
    let natureId: number | null = catData.nature_id || null;
    if (!natureId) {
      const kindStr = (catData.nature || catData.kind || 'operating').trim().toLowerCase();
      const matchedN = lookups.natures.find((n: any) => {
        const nn = n.name.toLowerCase();
        return nn === kindStr ||
          (kindStr === 'operating' && nn.includes('operating')) ||
          ((kindStr === 'tax' || kindStr.includes('statutory')) && nn.includes('statutory')) ||
          (kindStr === 'capex' && nn.includes('capex')) ||
          ((kindStr === 'financing' || kindStr.includes('owner')) && nn.includes('financing'));
      });
      if (matchedN) natureId = matchedN.id;
      else natureId = 1; // fallback to Operating
    }

    // 6. Resolve tds_section_id
    let tdsSectionId: number | null = catData.tds_section_id || null;
    if (!tdsSectionId) {
      const tdsCode = (catData.tds_section || catData.tdsSection || '').trim().toUpperCase();
      if (tdsCode) {
        const matchedT = lookups.tdsSections.find((t: any) =>
          t.code.toUpperCase() === tdsCode || tdsCode.includes(t.code.toUpperCase())
        );
        if (matchedT) tdsSectionId = matchedT.id;
      }
    }

    // 7. Input GST on bills
    let inputGst = catData.input_gst_on_bills;
    if (!inputGst) {
      const isBlocked = (catData.itcBlocked === true || catData.itcBlocked === '1' || catData.itcBlocked === 'true' || catData.itcBlocked === 'blocked_not_claimable');
      const matchedGst = (lookups.inputGstOnBills || []).find((g: any) =>
        isBlocked ? (g.value === 'blocked_not_claimable' || (g.label || '').toLowerCase().includes('blocked')) : (g.value === 'claimable_itc' || (g.label || '').toLowerCase().includes('claimable'))
      );
      inputGst = matchedGst ? matchedGst.label : (isBlocked ? 'Blocked · not claimable' : 'Claimable (ITC)');
    } else {
      const matchedGst = (lookups.inputGstOnBills || []).find((g: any) =>
        g.value === inputGst || g.label === inputGst
      );
      if (matchedGst) inputGst = matchedGst.label;
    }

    return {
      category_name: catName,
      type_id: typeId,
      summary_bucket_id: bucketId,
      group_id: groupId,
      linked_to_id: linkedToId,
      nature_id: natureId,
      tds_section_id: tdsSectionId,
      sac_code: (catData.sac_code || catData.sac || '').trim() || null,
      input_gst_on_bills: inputGst
    };
  },

  /**
   * Saves or updates a category in fss_categories
   */
  async saveCategory(catData: {
    supabase_id?: number | string | null;
    id?: number | string | null;
    category_name?: string;
    name?: string;
    type?: string | null;
    type_id?: number | null;
    summary_bucket?: string | null;
    summary_bucket_id?: number | null;
    bucket?: string | null;
    group?: string | null;
    group_id?: number | null;
    linked_to?: string | null;
    linked_to_id?: number | null;
    partyKind?: string | null;
    nature?: string | null;
    nature_id?: number | null;
    kind?: string | null;
    tds_section?: string | null;
    tds_section_id?: number | null;
    tdsSection?: string | null;
    sac_code?: string | null;
    sac?: string | null;
    input_gst_on_bills?: string | null;
    itcBlocked?: boolean | string | null;
  }): Promise<any> {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please check your .env configuration.');
    }

    const lookups = await this.loadCategoryLookups();
    const payload = this.resolveCategoryPayload(catData, lookups);

    // If group_id is still null and a group name was provided, create new group
    const groupName = (catData.group || '').trim();
    if (!payload.group_id && groupName) {
      try {
        const { data: newG } = await supabase.from('fss_category_group').insert([{ name: groupName }]).select().single();
        if (newG) {
          payload.group_id = newG.id;
          lookups.groups.push(newG);
        }
      } catch (e) {
        console.warn('Could not insert new category group:', groupName, e);
      }
    }

    const existingId = catData.supabase_id || (!isNaN(Number(catData.id)) ? Number(catData.id) : null);
    let category: any = null;

    // 1. Try update by numeric ID if provided
    if (existingId) {
      const { data: updated, error: updateErr } = await supabase
        .from('fss_categories')
        .update(payload)
        .eq('id', existingId)
        .select('*, fss_type(name), fss_category_summary_bucket(name), fss_category_group(name), fss_category_linked_to(name), fss_category_nature(name), fss_category_tds_section(code, description)')
        .maybeSingle();

      if (!updateErr && updated) {
        category = updated;
      }
    }

    // 2. Check if already exists by category_name
    if (!category && payload.category_name) {
      const { data: existingRow } = await supabase
        .from('fss_categories')
        .select('id')
        .eq('category_name', payload.category_name)
        .maybeSingle();

      if (existingRow?.id) {
        const { data: updatedByName, error: updateNameErr } = await supabase
          .from('fss_categories')
          .update(payload)
          .eq('id', existingRow.id)
          .select('*, fss_type(name), fss_category_summary_bucket(name), fss_category_group(name), fss_category_linked_to(name), fss_category_nature(name), fss_category_tds_section(code, description)')
          .maybeSingle();

        if (!updateNameErr && updatedByName) {
          category = updatedByName;
        }
      }
    }

    // 3. Otherwise insert new category
    if (!category) {
      const { data: inserted, error: insertErr } = await supabase
        .from('fss_categories')
        .insert([payload])
        .select('*, fss_type(name), fss_category_summary_bucket(name), fss_category_group(name), fss_category_linked_to(name), fss_category_nature(name), fss_category_tds_section(code, description)')
        .single();

      if (insertErr) {
        console.error('fss_categories insert error:', insertErr);
        throw new Error(`Failed to save category: ${insertErr.message}`);
      }
      category = inserted;
    }

    if (!category || !category.id) {
      throw new Error('Category record saved, but no generated ID was returned.');
    }

    return category;
  },

  /**
   * Loads all categories from fss_categories with lookup joins
   */
  async loadCategoriesFromSupabase(): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured; cannot load categories.');
    try {
      const { data: cats, error: catErr } = await supabase
        .from('fss_categories')
        .select('*, fss_type(name), fss_category_summary_bucket(name), fss_category_group(name), fss_category_linked_to(name), fss_category_nature(name), fss_category_tds_section(code, description)')
        .order('id', { ascending: true });

      if (catErr) {
        throw new Error(`Failed to load categories from Supabase: ${catErr.message}`);
      }
      return cats || [];
    } catch (err) {
      console.error('Error in loadCategoriesFromSupabase:', err);
      throw err;
    }
  },

  /**
   * Deletes a category from fss_categories by id or category_name
   */
  async deleteCategory(categoryIdOrName: string | number): Promise<boolean> {
    if (!supabase || !categoryIdOrName) return false;
    try {
      const numId = Number(categoryIdOrName);
      if (!isNaN(numId)) {
        const { error } = await supabase.from('fss_categories').delete().eq('id', numId);
        if (error) {
          console.error('Error deleting category from fss_categories by id:', error.message);
          return false;
        }
      } else {
        const { error } = await supabase.from('fss_categories').delete().eq('category_name', String(categoryIdOrName));
        if (error) {
          console.error('Error deleting category from fss_categories by name:', error.message);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('Exception deleting category:', err);
      return false;
    }
  },

  /**
   * Syncs local categories into Supabase fss_categories if the remote table is empty or missing them
   */
  async syncLocalCategoriesToSupabase(localCategories: any[]): Promise<any[]> {
    if (!supabase) return [];
    const validCats = (localCategories || []).filter((c: any) => c.name || c.category_name);
    if (validCats.length === 0) return [];

    const lookups = await this.loadCategoryLookups();

    // Check existing categories to prevent duplicate insertion
    const { data: existing } = await supabase.from('fss_categories').select('id, category_name');
    const existingMap = new Map<string, number>();
    (existing || []).forEach((e: any) => {
      const k = (e.category_name || '').trim().toLowerCase();
      if (k) existingMap.set(k, e.id);
    });

    const toInsertPayloads: any[] = [];
    const toInsertRefs: any[] = [];
    const syncedCats: any[] = [];

    for (const c of validCats) {
      const name = (c.name || c.category_name || '').trim();
      if (!name) continue;
      const lower = name.toLowerCase();

      if (existingMap.has(lower)) {
        c.supabase_id = existingMap.get(lower);
        continue;
      }

      try {
        const payload = this.resolveCategoryPayload(c, lookups);

        // If group is new, create it in fss_category_group
        if (!payload.group_id && c.group) {
          const { data: newG } = await supabase.from('fss_category_group').insert([{ name: c.group.trim() }]).select().single();
          if (newG) {
            payload.group_id = newG.id;
            lookups.groups.push(newG);
          }
        }

        toInsertPayloads.push(payload);
        toInsertRefs.push(c);
      } catch (e) {
        console.warn('Could not prepare category payload for sync:', name, e);
      }
    }

    if (toInsertPayloads.length > 0) {
      try {
        const { data: inserted, error: insertErr } = await supabase
          .from('fss_categories')
          .insert(toInsertPayloads)
          .select('*, fss_type(name), fss_category_summary_bucket(name), fss_category_group(name), fss_category_linked_to(name), fss_category_nature(name), fss_category_tds_section(code, description)');

        if (insertErr) {
          console.error('Batch insert into fss_categories error:', insertErr);
        } else if (inserted) {
          inserted.forEach((ins: any, idx: number) => {
            if (toInsertRefs[idx]) {
              toInsertRefs[idx].supabase_id = ins.id;
            }
            syncedCats.push(ins);
          });
        }
      } catch (batchErr) {
        console.error('Exception during batch category sync:', batchErr);
      }
    }

    return syncedCats;
  },

  /**
   * Saves an order and its associated departments, payment terms, and details into Supabase tables:
   * - public.fss_table_order_po
   * - public.fss_table_order_departments
   * - public.fss_table_order_payment_terms
   * - public.fss_table_order_details
   */
  async saveOrder(
    orderData: any,
    partiesListArg: any[] = [],
    projectsListArg: any[] = [],
    departmentsListArg: any[] = []
  ): Promise<any> {
    if (!supabase) return null;
    const isUUID = (s: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));

    const orderNumber = String(orderData.orderNo || orderData.order_number || orderData.po_number || '').trim();
    if (!orderNumber) {
      throw new Error('PO / Order number is required.');
    }

    // 1. Order Date
    const orderDate = orderData.date || orderData.order_date || new Date().toISOString().slice(0, 10);
    const expComp = (orderData.expectedCompletion || orderData.expected_completion || '').trim();
    const expectedCompletion = expComp ? expComp : null;

    // 2. Client & Project resolving
    const partiesList = (partiesListArg && partiesListArg.length > 0)
      ? partiesListArg
      : (typeof window !== 'undefined' && ((window as any).Store?.data?.parties || (window as any).IuovaCore?.Store?.data?.parties || (window as any).api?.list?.('parties') || (window as any).IuovaCore?.api?.list?.('parties'))) || [];

    const projectsList = (projectsListArg && projectsListArg.length > 0)
      ? projectsListArg
      : (typeof window !== 'undefined' && ((window as any).Store?.data?.projects || (window as any).IuovaCore?.Store?.data?.projects || (window as any).api?.list?.('projects') || (window as any).IuovaCore?.api?.list?.('projects'))) || [];

    const deptList = (departmentsListArg && departmentsListArg.length > 0)
      ? departmentsListArg
      : (typeof window !== 'undefined' && ((window as any).Store?.data?.departments || (window as any).IuovaCore?.Store?.data?.departments || (window as any).api?.list?.('departments') || (window as any).IuovaCore?.api?.list?.('departments'))) || [];

    let clientId: string | null = null;
    let clientName: string = String(orderData.client_name || orderData.clientName || '').trim();
    if (clientName.toLowerCase() === 'client') clientName = '';

    if (orderData.clientId) {
      if (isUUID(orderData.clientId)) {
        clientId = orderData.clientId;
      }
      const cl = partiesList.find((p: any) => p.id === orderData.clientId || p.supabase_id === orderData.clientId);
      if (cl) {
        if (!clientName) clientName = String(cl.name || cl.client_name || '').trim();
        if (!clientId && cl.supabase_id && isUUID(cl.supabase_id)) {
          clientId = cl.supabase_id;
        } else if (!clientId && cl.id && isUUID(cl.id)) {
          clientId = cl.id;
        }
      }
    }
    if (!clientName && clientId) {
      const cl = partiesList.find((p: any) => p.supabase_id === clientId || p.id === clientId);
      if (cl) clientName = String(cl.name || cl.client_name || '').trim();
    }

    // Fallback direct Supabase lookup if clientName is still empty
    if (!clientName && (clientId || orderData.clientId)) {
      try {
        const targetId = clientId || (isUUID(orderData.clientId) ? orderData.clientId : null);
        if (targetId) {
          const { data: cRow } = await supabase.from('fss_client').select('id, client_name').eq('id', targetId).maybeSingle();
          if (cRow?.client_name) {
            clientName = cRow.client_name;
          }
        }
      } catch (err) {
        console.warn('Could not fetch client from fss_client:', err);
      }
    }

    // If clientName is known but clientId is missing, look up fss_client by name
    if (!clientId && clientName) {
      try {
        const { data: cRow } = await supabase.from('fss_client').select('id').ilike('client_name', clientName).limit(1).maybeSingle();
        if (cRow?.id) {
          clientId = cRow.id;
        }
      } catch (_) {}
    }

    if (!clientName) {
      clientName = 'Client';
    }

    let projectId: string | null = null;
    let projectName: string = String(orderData.project_name || orderData.projectName || '').trim();
    if (projectName.toLowerCase() === 'project') projectName = '';

    if (orderData.projectId) {
      if (isUUID(orderData.projectId)) {
        projectId = orderData.projectId;
      }
      const pr = projectsList.find((p: any) => 
        p.id === orderData.projectId || 
        p.supabase_id === orderData.projectId || 
        String(p.id) === String(orderData.projectId) ||
        (p.code && p.code.toLowerCase() === String(orderData.projectId).toLowerCase())
      );
      if (pr) {
        if (!projectName) {
          projectName = pr.name || pr.project_name || (pr.code ? (pr.code + ' · ' + (pr.name || '')) : pr.code) || '';
        }
        if (!projectId && pr.supabase_id && isUUID(pr.supabase_id)) {
          projectId = pr.supabase_id;
        } else if (!projectId && pr.id && isUUID(pr.id)) {
          projectId = pr.id;
        }
      }
    }

    // Fallback direct Supabase lookup if projectName is still empty
    if (!projectName && orderData.projectId) {
      try {
        let pQuery = supabase.from('fss_projects').select('id, project_name, project_code');
        if (!isNaN(Number(orderData.projectId))) {
          pQuery = pQuery.eq('id', Number(orderData.projectId));
        } else if (typeof orderData.projectId === 'string') {
          pQuery = pQuery.or(`project_code.ilike.%${orderData.projectId}%,project_name.ilike.%${orderData.projectId}%`);
        }
        const { data: pRow } = await pQuery.limit(1).maybeSingle();
        if (pRow) {
          projectName = pRow.project_name || pRow.project_code || '';
        }
      } catch (err) {
        console.warn('Could not fetch project from fss_projects:', err);
      }
    }

    if (!projectName) {
      projectName = 'Project';
    }

    // 3. GST values
    const gstRate = Math.min(100, Math.max(0, Number(orderData.gstRate ?? orderData.gst_rate ?? 18)));
    let gstType = 'CGST + SGST';
    const rawGstType = String(orderData.gstType || orderData.gst_type || '').toLowerCase();
    if (rawGstType === 'inter' || rawGstType === 'igst') gstType = 'IGST';
    else if (rawGstType === 'none' || gstRate === 0) gstType = 'NONE';
    else gstType = 'CGST + SGST';

    const preGstAmount = Math.max(0, Number(orderData.taxable ?? orderData.pre_gst_amount ?? orderData.order_value_pre_gst ?? 0));
    const gstAmount = Math.max(0, Number(orderData.gstAmount ?? orderData.gst_amount ?? (preGstAmount * gstRate / 100)));
    const totalAmount = Math.max(0, Number(orderData.total ?? orderData.total_amount ?? orderData.order_total_incl_gst ?? (preGstAmount + gstAmount)));

    // 4. Save into public.fss_table_order_po
    const poPayload: any = {
      po_number: orderNumber,
      order_date: orderDate,
      client_id: clientId,
      client_name: clientName,
      project_id: projectId,
      project_name: projectName,
      updated_at: new Date().toISOString()
    };

    if (orderData.supabase_id && isUUID(orderData.supabase_id)) {
      poPayload.id = orderData.supabase_id;
    }

    const { data: savedPo, error: poErr } = await supabase
      .from('fss_table_order_po')
      .upsert(poPayload, { onConflict: 'po_number' })
      .select()
      .single();

    if (poErr) {
      console.error('Error saving order into fss_table_order_po:', poErr);
      throw new Error(`Failed to save PO to Supabase: ${poErr.message}`);
    }

    const orderPoId = savedPo.id;

    // 5. Save into public.fss_table_order_departments
    try {
      await supabase.from('fss_table_order_departments').delete().eq('order_po_id', orderPoId);

      const deptRows: any[] = [];

      if (Array.isArray(orderData.split) && orderData.split.length > 0) {
        orderData.split.forEach((s: any) => {
          if (!s.departmentId && !s.department_name && !s.departmentName) return;
          const dp = deptList.find((d: any) => d.id === s.departmentId);
          const dName = dp?.name || s.department_name || s.departmentName || s.departmentId || 'Operations / Admin';
          const amt = Math.max(0, Number(s.amount != null && s.amount !== '' ? s.amount : (preGstAmount * (s.pct || 100) / 100)));
          deptRows.push({
            order_po_id: orderPoId,
            po_number: orderNumber,
            client_name: clientName,
            department_name: dName,
            amount: amt,
            order_value_pre_gst: preGstAmount,
            gst_rate: gstRate,
            gst_type: gstType,
            order_total_incl_gst: totalAmount,
            updated_at: new Date().toISOString()
          });
        });
      }

      if (deptRows.length === 0) {
        const dp = deptList.find((d: any) => d.id === orderData.departmentId);
        const dName = dp?.name || orderData.department_name || orderData.departmentId || 'Operations / Admin';
        deptRows.push({
          order_po_id: orderPoId,
          po_number: orderNumber,
          client_name: clientName,
          department_name: dName,
          amount: preGstAmount,
          order_value_pre_gst: preGstAmount,
          gst_rate: gstRate,
          gst_type: gstType,
          order_total_incl_gst: totalAmount,
          updated_at: new Date().toISOString()
        });
      }

      if (deptRows.length > 0) {
        await supabase.from('fss_table_order_departments').insert(deptRows);
      }
    } catch (dErr) {
      console.warn('Error syncing order departments:', dErr);
    }

    // 6. Save into public.fss_table_order_payment_terms
    try {
      await supabase.from('fss_table_order_payment_terms').delete().eq('order_po_id', orderPoId);

      const termsRows: any[] = [];
      const rawTerms = Array.isArray(orderData.terms) && orderData.terms.length > 0
        ? orderData.terms
        : [{ label: '100% on delivery', pct: 100 }];

      rawTerms.forEach((t: any, idx: number) => {
        const pct = Math.min(100, Math.max(0, Number(t.pct || t.percentage || 0)));
        const amt = Math.max(0, Number(t.amount != null && t.amount !== '' ? t.amount : Math.round(preGstAmount * pct / 100)));
        const isLast = idx === rawTerms.length - 1;
        const isBalance = Boolean(t.is_balance ?? (isLast && rawTerms.length > 1));
        termsRows.push({
          order_po_id: orderPoId,
          po_number: orderNumber,
          client_name: clientName,
          milestone_name: String(t.label || t.milestone_name || `Milestone ${idx + 1}`).trim(),
          milestone_amount: amt,
          percentage: pct,
          sequence_number: idx + 1,
          is_balance: isBalance,
          updated_at: new Date().toISOString()
        });
      });

      if (termsRows.length > 0) {
        await supabase.from('fss_table_order_payment_terms').insert(termsRows);
      }
    } catch (mErr) {
      console.warn('Error syncing order payment terms:', mErr);
    }

    // 7. Save into public.fss_table_order_details
    try {
      const att = Array.isArray(orderData.attachments) && orderData.attachments.length > 0 ? orderData.attachments[0] : null;
      const docName = att?.name || att?.file_name || orderData.document_name || null;
      const docPath = att?.path || att?.storage_path || orderData.document_path || null;
      const docUrl = att?.url || orderData.document_url || null;

      const detailsPayload: any = {
        order_po_id: orderPoId,
        po_number: orderNumber,
        client_name: clientName,
        scope: (orderData.scope && String(orderData.scope).trim()) || null,
        expected_completion: expectedCompletion,
        client_contact: (orderData.contact || orderData.client_contact || '').trim() || null,
        notes: (orderData.notes && String(orderData.notes).trim()) || null,
        document_name: docName,
        document_path: docPath,
        document_url: docUrl,
        updated_at: new Date().toISOString()
      };

      await supabase
        .from('fss_table_order_details')
        .upsert(detailsPayload, { onConflict: 'order_po_id' });
    } catch (detErr) {
      console.warn('Error syncing order details:', detErr);
    }

    // Return joined order
    const { data: fullOrder } = await supabase
      .from('fss_table_order_po')
      .select(`
        *,
        fss_table_order_departments(*),
        fss_table_order_payment_terms(*),
        fss_table_order_details(*)
      `)
      .eq('id', orderPoId)
      .single();

    return fullOrder || savedPo;
  },

  /**
   * Loads all orders with departments, payment terms, and details from Supabase
   */
  async loadOrdersFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_table_order_po')
        .select(`
          *,
          fss_table_order_departments(*),
          fss_table_order_payment_terms(*),
          fss_table_order_details(*)
        `)
        .order('order_date', { ascending: false });

      if (error) {
        console.warn('Error fetching orders from fss_table_order_po:', error.message);
        // Fallback to fss_table_orders if needed
        const { data: legacyData } = await supabase
          .from('fss_table_orders')
          .select(`*, fss_table_order_departments(*), fss_table_order_milestones(*), fss_table_order_documents(*)`)
          .order('order_date', { ascending: false });
        return legacyData || [];
      }
      return data || [];
    } catch (err) {
      console.error('Unexpected error loading orders:', err);
      return [];
    }
  },

  /**
   * Deletes an order from fss_table_order_po (cascades to departments, payment terms, details)
   */
  async deleteOrder(orderIdOrNo: string | number): Promise<boolean> {
    if (!supabase) return false;
    try {
      const idStr = String(orderIdOrNo);
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idStr);
      let query = supabase.from('fss_table_order_po').delete();
      if (isUUID) {
        query = query.eq('id', idStr);
      } else {
        query = query.eq('po_number', idStr);
      }
      const { error } = await query;
      if (error) {
        console.error('Error deleting order from fss_table_order_po:', error);
      }

      // Also attempt cleanup on legacy fss_table_orders
      try {
        const q2 = supabase.from('fss_table_orders').delete();
        if (isUUID) await q2.eq('id', idStr);
        else await q2.eq('order_number', idStr);
      } catch (_) {}

      return true;
    } catch (err) {
      console.error('Exception deleting order from Supabase:', err);
      return false;
    }
  },

  /**
   * Batch syncs initial local orders into Supabase if fss_table_order_po is empty
   */
  async syncLocalOrdersToSupabase(
    localOrders: any[],
    partiesList: any[] = [],
    projectsList: any[] = [],
    departmentsList: any[] = []
  ): Promise<any[]> {
    if (!supabase) return [];
    const valid = (localOrders || []).filter((o: any) => o.orderNo || o.order_number || o.po_number);
    if (valid.length === 0) return [];

    const synced: any[] = [];
    for (const o of valid) {
      try {
        const res = await this.saveOrder(o, partiesList, projectsList, departmentsList);
        if (res) {
          o.supabase_id = res.id;
          synced.push(res);
        }
      } catch (err) {
        console.warn('Could not sync initial order:', o.orderNo || o.po_number, err);
      }
    }
    return synced;
  },

  /**
   * Formats a local entry / transaction into the schema expected by public.fss_table_transactions
   */
  formatTransactionPayload(
    entry: any,
    parties: any[] = [],
    projects: any[] = [],
    departments: any[] = [],
    categories: any[] = [],
    accounts: any[] = []
  ) {
    const isOutflow = entry.type === 'outflow';
    const txnType = entry.type === 'inflow' ? 'Inflow' : 'Outflow';
    const txnDate = entry.date || entry.transaction_date || new Date().toISOString().split('T')[0];

    // Resolve Category name
    let categoryName = entry.category || entry.categoryName || '';
    if (!categoryName && entry.categoryId) {
      const matchCat = categories.find((c: any) => c.id === entry.categoryId || c.supabase_id === entry.categoryId);
      if (matchCat) categoryName = matchCat.name;
    }
    if (!categoryName) {
      categoryName = txnType === 'Inflow' ? 'Operating Receipts' : 'Office – Fixed';
    }

    // Resolve Description (NOT NULL)
    const rawDesc = (entry.description || '').trim();
    let description = rawDesc || categoryName || entry.refNo || 'Transaction';
    const taxPeriodMatch = String(entry.taxPeriod || '').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (taxPeriodMatch && ['cat_gstpay', 'cat_tdsdep', 'cat_ptax'].includes(entry.categoryId)) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const periodText = `for ${monthNames[Number(taxPeriodMatch[2]) - 1]} ${taxPeriodMatch[1]}`;
      const periodPattern = /\bfor (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/i;
      description = periodPattern.test(description)
        ? description.replace(periodPattern, periodText)
        : `${description} ${periodText}`;
    }

    // Resolve Reference number
    const referenceNumber = entry.refNo || entry.txnRef || entry.reference_number || null;

    // Resolve Party name
    let partyName = entry.party_name || entry.partyName || '';
    if (!partyName && entry.partyId) {
      const matchParty = parties.find((p: any) => p.id === entry.partyId || p.supabase_id === entry.partyId);
      if (matchParty) partyName = matchParty.name;
    }

    // Resolve Project
    let projectName = entry.project_name || entry.projectName || '';
    let projectCode = entry.project_code || entry.projectCode || '';
    if ((!projectName || !projectCode) && entry.projectId) {
      const matchProj = projects.find((p: any) => p.id === entry.projectId || p.supabase_id === entry.projectId);
      if (matchProj) {
        if (!projectName) projectName = matchProj.name;
        if (!projectCode) projectCode = matchProj.code;
      }
    }

    // Resolve Department
    let departmentName = entry.department || entry.departmentName || '';
    if (!departmentName && entry.departmentId) {
      const matchDept = departments.find((d: any) => d.id === entry.departmentId || d.supabase_id === entry.departmentId);
      if (matchDept) departmentName = matchDept.name;
    }

    // Resolve Account name
    let accountName = entry.account_name || entry.accountName || '';
    if (!accountName && entry.accountId) {
      const matchAcc = accounts.find((a: any) => a.id === entry.accountId || a.supabase_id === entry.accountId);
      if (matchAcc) accountName = matchAcc.name;
    }

    // Amounts
    const taxableAmount = Math.max(0, Number(entry.taxable ?? entry.taxable_amount) || 0);
    const gstRate = Math.max(0, Math.min(100, Number(entry.gstRate ?? entry.gst_rate) || 0));
    const gstAmount = Math.max(0, Number(entry.gstAmount ?? entry.gst_amount) || 0);
    const tdsAmount = Math.max(0, Number(entry.tdsAmount ?? entry.tds_amount) || 0);

    // Net cash: inflow positive, outflow negative
    let netAmount = Math.abs(Number(entry.amount) || (taxableAmount + gstAmount - tdsAmount));
    if (netAmount === 0 && Number(entry.net_cash)) {
      netAmount = Math.abs(Number(entry.net_cash));
    }
    const netCash = isOutflow ? -netAmount : netAmount;

    // Financial year
    const financialYear = entry.financial_year || getFinancialYear(txnDate);

    // Status: Active or Cancelled
    const status = entry.deleted ? 'Cancelled' : (entry.status === 'Cancelled' ? 'Cancelled' : 'Active');

    return {
      transaction_date: txnDate,
      transaction_type: txnType,
      description,
      reference_number: referenceNumber,
      party_name: partyName || null,
      project_name: projectName || null,
      project_code: projectCode || null,
      department: departmentName || null,
      category: categoryName,
      taxable_amount: taxableAmount,
      gst_rate: gstRate,
      gst_amount: gstAmount,
      tds_amount: tdsAmount,
      net_cash: netCash,
      account_name: accountName || null,
      payment_mode: entry.paymentMode || entry.payment_mode || 'NEFT',
      financial_year: financialYear,
      notes: entry.notes || null,
      status,
      updated_at: new Date().toISOString()
    };
  },

  /**
   * Saves or updates a transaction in public.fss_table_transactions
   */
  async saveTransaction(
    entry: any,
    parties: any[] = [],
    projects: any[] = [],
    departments: any[] = [],
    categories: any[] = [],
    accounts: any[] = []
  ): Promise<any> {
    if (!supabase) return null;
    try {
      const payload = this.formatTransactionPayload(entry, parties, projects, departments, categories, accounts);

      const targetId = entry.supabase_id || (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(entry.id)) ? entry.id : null);

      if (targetId) {
        const { data: updated, error: updErr } = await supabase
          .from('fss_table_transactions')
          .update(payload)
          .eq('id', targetId)
          .select()
          .maybeSingle();

        if (!updErr && updated) {
          return updated;
        }
      }

      // If no target ID or update didn't match, insert
      const { data: inserted, error: insErr } = await supabase
        .from('fss_table_transactions')
        .insert(payload)
        .select()
        .single();

      if (insErr) {
        console.error('Error inserting transaction into fss_table_transactions:', insErr);
        return null;
      }

      return inserted;
    } catch (err) {
      console.error('Exception saving transaction to Supabase:', err);
      return null;
    }
  },

  /**
   * Cancels (soft deletes) a transaction in fss_table_transactions
   */
  async cancelTransaction(idOrSupabaseId: string | number, entry?: any): Promise<boolean> {
    if (!supabase) return false;
    try {
      const targetId = String(idOrSupabaseId || '');
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);

      let query = supabase.from('fss_table_transactions').update({
        status: 'Cancelled',
        updated_at: new Date().toISOString()
      });

      if (isUUID) {
        query = query.eq('id', targetId);
      } else if (entry && entry.supabase_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(entry.supabase_id))) {
        query = query.eq('id', String(entry.supabase_id));
      } else if (entry && entry.refNo) {
        query = query.eq('reference_number', entry.refNo);
      } else if (targetId && !targetId.startsWith('e_') && !targetId.startsWith('e2')) {
        query = query.eq('reference_number', targetId);
      } else if (entry && entry.date) {
        query = query.eq('transaction_date', entry.date);
        if (entry.taxable != null) query = query.eq('taxable_amount', entry.taxable);
      } else {
        query = query.eq('reference_number', targetId);
      }

      const { error } = await query;
      if (error) {
        console.error('Error cancelling transaction in Supabase:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Exception cancelling transaction in Supabase:', err);
      return false;
    }
  },

  /**
   * Permanently deletes a transaction from fss_table_transactions
   */
  async deleteTransaction(idOrSupabaseId: string | number, entry?: any): Promise<boolean> {
    if (!supabase) return false;
    try {
      const targetId = String(idOrSupabaseId || '');
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);

      let query = supabase.from('fss_table_transactions').delete();
      if (isUUID) {
        query = query.eq('id', targetId);
      } else if (entry && entry.supabase_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(entry.supabase_id))) {
        query = query.eq('id', String(entry.supabase_id));
      } else if (entry && entry.refNo) {
        query = query.eq('reference_number', entry.refNo);
      } else if (targetId && !targetId.startsWith('e_') && !targetId.startsWith('e2')) {
        query = query.eq('reference_number', targetId);
      } else if (entry && entry.date) {
        query = query.eq('transaction_date', entry.date);
        if (entry.taxable != null) query = query.eq('taxable_amount', entry.taxable);
      } else {
        query = query.eq('reference_number', targetId);
      }

      const { error } = await query;
      if (error) {
        console.error('Error deleting transaction from Supabase:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Exception deleting transaction from Supabase:', err);
      return false;
    }
  },

  /**
   * Loads all transactions from public.fss_table_transactions
   */
  async loadTransactionsFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      let allRecords: any[] = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('fss_table_transactions')
          .select('*')
          .order('transaction_date', { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) {
          console.error('Error loading transactions from Supabase:', error);
          break;
        }

        if (!data || data.length === 0) break;
        allRecords = allRecords.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }

      return allRecords;
    } catch (err) {
      console.error('Exception loading transactions from Supabase:', err);
      return [];
    }
  },

  /**
   * Batch syncs initial local transactions into Supabase if fss_table_transactions is empty
   */
  async syncLocalTransactionsToSupabase(
    localEntries: any[],
    parties: any[] = [],
    projects: any[] = [],
    departments: any[] = [],
    categories: any[] = [],
    accounts: any[] = []
  ): Promise<any[]> {
    if (!supabase) return [];
    const valid = (localEntries || []).filter((e: any) => e.date && !e.deleted && e.type !== 'transfer');
    if (valid.length === 0) return [];

    const payloads = valid.map((e: any) => ({
      ...this.formatTransactionPayload(e, parties, projects, departments, categories, accounts),
      created_at: e.createdAt || new Date().toISOString()
    }));

    const synced: any[] = [];
    const CHUNK_SIZE = 100;
    for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
      const chunk = payloads.slice(i, i + CHUNK_SIZE);
      const originalEntriesChunk = valid.slice(i, i + CHUNK_SIZE);
      try {
        const { data, error } = await supabase
          .from('fss_table_transactions')
          .insert(chunk)
          .select();

        if (error) {
          console.error(`Error inserting transaction batch ${i / CHUNK_SIZE + 1}:`, error);
        } else if (data) {
          data.forEach((row: any, idx: number) => {
            if (originalEntriesChunk[idx]) {
              originalEntriesChunk[idx].supabase_id = row.id;
            }
          });
          synced.push(...data);
        }
      } catch (err) {
        console.warn(`Exception inserting transaction batch ${i / CHUNK_SIZE + 1}:`, err);
      }
    }
    return synced;
  },

  /**
   * Loads all rows from public.fss_operation_receipts
   */
  async loadOperationReceiptsFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_operation_receipts')
        .select('*')
        .order('id', { ascending: true });
      if (error) {
        console.error('Error loading fss_operation_receipts from Supabase:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception loading fss_operation_receipts from Supabase:', err);
      return [];
    }
  },

  /**
   * Loads all rows from public.fss_income
   */
  async loadIncomeFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_income')
        .select('*')
        .order('id', { ascending: true });
      if (error) {
        console.error('Error loading fss_income from Supabase:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception loading fss_income from Supabase:', err);
      return [];
    }
  },

  /**
   * Loads all rows from public.fss_financing
   */
  async loadFinancingFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_financing')
        .select('*')
        .order('id', { ascending: true });
      if (error) {
        console.error('Error loading fss_financing from Supabase:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception loading fss_financing from Supabase:', err);
      return [];
    }
  },

  /**
   * Loads all rows from public.fss_cash_inflow (view or table)
   */
  async loadCashInflowFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_cash_inflow')
        .select('*');
      if (error) {
        console.error('Error loading fss_cash_inflow from Supabase:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception loading fss_cash_inflow from Supabase:', err);
      return [];
    }
  },

  /**
   * Loads all cashflow inflow tables in parallel
   */
  async loadAllCashflowInflowFromSupabase(): Promise<{
    operationReceipts: any[];
    income: any[];
    financing: any[];
    cashInflow: any[];
  }> {
    if (!supabase) {
      return { operationReceipts: [], income: [], financing: [], cashInflow: [] };
    }
    const [operationReceipts, income, financing, cashInflow] = await Promise.all([
      this.loadOperationReceiptsFromSupabase(),
      this.loadIncomeFromSupabase(),
      this.loadFinancingFromSupabase(),
      this.loadCashInflowFromSupabase()
    ]);
    return { operationReceipts, income, financing, cashInflow };
  },

  async loadCashOutflowSummaryFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('fss_cash_outflow')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async loadCashflowStatementFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('fss_cash_flow_statement')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  /**
   * Saves or updates a row into public.fss_operation_receipts using primary key id
   */
  async saveOperationReceipt(record: any): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const payload = { ...record };
    delete payload.created_at;

    if (payload.id) {
      const { data: updated, error: updErr } = await supabase
        .from('fss_operation_receipts')
        .update(payload)
        .eq('id', payload.id)
        .select()
        .maybeSingle();
      if (!updErr && updated) return updated;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('fss_operation_receipts')
      .insert(payload)
      .select()
      .single();
    if (insErr) {
      console.error('Error inserting into fss_operation_receipts:', insErr);
      throw insErr;
    }
    return inserted;
  },

  /**
   * Updates a single cell (month column) for an Income record in public.fss_income by id,
   * recalculates the total row (Other Income Total), and returns the updated dataset.
   * Note: fy_to_date is a Postgres generated column in fss_income, so it is never included in updates.
   */
  async updateIncomeCell(
    idOrName: number | string,
    monthCol: string,
    newValue: number | string
  ): Promise<{ updatedRow: any; totalRow: any; allRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const validMonthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];
    const cleanCol = (monthCol || '').toLowerCase().trim();
    if (!validMonthCols.includes(cleanCol)) {
      throw new Error(`Invalid month column: ${monthCol}`);
    }

    const numVal = Number(newValue);
    const cleanVal = isNaN(numVal) || numVal < 0 ? 0 : Math.round(numVal * 100) / 100;

    let targetId: number | null = typeof idOrName === 'number' ? idOrName : null;
    if (!targetId && !isNaN(Number(idOrName))) {
      targetId = Number(idOrName);
    }

    let currentRow: any = null;
    if (targetId) {
      const { data, error } = await supabase
        .from('fss_income')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();
      if (error) throw error;
      currentRow = data;
    } else {
      const { data, error } = await supabase
        .from('fss_income')
        .select('*')
        .ilike('income_name', String(idOrName).trim())
        .maybeSingle();
      if (error) throw error;
      currentRow = data;
      if (currentRow) targetId = currentRow.id;
    }

    if (!currentRow) {
      throw new Error(`Record "${idOrName}" not found in fss_income.`);
    }

    // Do NOT include fy_to_date in payload as it is generated in fss_income
    const payload: Record<string, any> = {
      [cleanCol]: cleanVal
    };

    const { data: updated, error: updErr } = await supabase
      .from('fss_income')
      .update(payload)
      .eq('id', currentRow.id)
      .select()
      .single();

    if (updErr) {
      console.error('Error updating fss_income record:', updErr);
      throw updErr;
    }

    const { data: allRows } = await supabase
      .from('fss_income')
      .select('*')
      .order('id', { ascending: true });

    // Recalculate total row
    const detailRows = (allRows || []).filter(
      (r: any) => !r.income_name?.toLowerCase().includes('total') && r.id !== 3
    );
    const currentTotalRow = (allRows || []).find(
      (r: any) => r.income_name?.toLowerCase().includes('total') || r.id === 3
    );

    let updatedTotalRow: any = null;
    if (currentTotalRow) {
      const tPayload: Record<string, any> = {};
      for (const m of validMonthCols) {
        const sumM = detailRows.reduce((acc: number, r: any) => acc + (Number(r[m]) || 0), 0);
        tPayload[m] = Math.round(sumM * 100) / 100;
      }
      const { data: tUpdated } = await supabase
        .from('fss_income')
        .update(tPayload)
        .eq('id', currentTotalRow.id)
        .select()
        .single();
      updatedTotalRow = tUpdated;
    }

    const { data: freshRows } = await supabase
      .from('fss_income')
      .select('*')
      .order('id', { ascending: true });

    return {
      updatedRow: updated,
      totalRow: updatedTotalRow,
      allRows: freshRows || []
    };
  },

  /**
   * Adds a new Income entry to public.fss_income
   */
  async addIncome(
    incomeName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = (incomeName || '').trim();
    if (!trimmed) throw new Error('Income name is required.');

    const isTotal = trimmed.toLowerCase().includes('total');
    if (isTotal) {
      throw new Error('Cannot add a record named "Total" as it is reserved for the subtotal.');
    }

    const validMonthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];

    const { data: existing } = await supabase
      .from('fss_income')
      .select('*')
      .ilike('income_name', trimmed);

    if (existing && existing.length > 0) {
      const ex = existing[0];
      const payload: Record<string, any> = {};
      for (const m of validMonthCols) {
        if (monthlyAmounts[m] !== undefined) {
          payload[m] = Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100;
        } else {
          payload[m] = Number(ex[m] || 0);
        }
      }
      const { data: updated, error: updErr } = await supabase
        .from('fss_income')
        .update(payload)
        .eq('id', ex.id)
        .select()
        .single();
      if (updErr) throw updErr;
      return updated;
    }

    const { data: maxIdRow } = await supabase
      .from('fss_income')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);

    const nextId = (maxIdRow && maxIdRow[0] && maxIdRow[0].id) ? maxIdRow[0].id + 1 : 1;

    const insertPayload: Record<string, any> = {
      id: nextId,
      income_name: trimmed
    };
    for (const m of validMonthCols) {
      const v = monthlyAmounts[m] !== undefined ? Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100 : 0;
      insertPayload[m] = v;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('fss_income')
      .insert(insertPayload)
      .select()
      .single();

    if (insErr) {
      console.error('Error inserting new income row:', insErr);
      throw insErr;
    }

    const { data: allRows } = await supabase.from('fss_income').select('*');
    const detailRows = (allRows || []).filter(
      (r: any) => !r.income_name?.toLowerCase().includes('total')
    );
    const currentTotalRow = (allRows || []).find(
      (r: any) => r.income_name?.toLowerCase().includes('total')
    );

    if (currentTotalRow) {
      const tPayload: Record<string, any> = {};
      for (const m of validMonthCols) {
        const sumM = detailRows.reduce((acc: number, r: any) => acc + (Number(r[m]) || 0), 0);
        tPayload[m] = Math.round(sumM * 100) / 100;
      }
      await supabase
        .from('fss_income')
        .update(tPayload)
        .eq('id', currentTotalRow.id);
    }

    return inserted;
  },

  /**
   * Updates a single cell (month column) for a Financing record in public.fss_financing by id,
   * recalculates fy_to_date, the total row (Financing Total), and returns the updated dataset.
   */
  async updateFinancingCell(
    idOrName: number | string,
    monthCol: string,
    newValue: number | string
  ): Promise<{ updatedRow: any; totalRow: any; allRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const validMonthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];
    const cleanCol = (monthCol || '').toLowerCase().trim();
    if (!validMonthCols.includes(cleanCol)) {
      throw new Error(`Invalid month column: ${monthCol}`);
    }

    const numVal = Number(newValue);
    const cleanVal = isNaN(numVal) || numVal < 0 ? 0 : Math.round(numVal * 100) / 100;

    let targetId: number | null = typeof idOrName === 'number' ? idOrName : null;
    if (!targetId && !isNaN(Number(idOrName))) {
      targetId = Number(idOrName);
    }

    let currentRow: any = null;
    if (targetId) {
      const { data, error } = await supabase
        .from('fss_financing')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();
      if (error) throw error;
      currentRow = data;
    } else {
      const { data, error } = await supabase
        .from('fss_financing')
        .select('*')
        .ilike('financing_name', String(idOrName).trim())
        .maybeSingle();
      if (error) throw error;
      currentRow = data;
      if (currentRow) targetId = currentRow.id;
    }

    if (!currentRow) {
      throw new Error(`Record "${idOrName}" not found in fss_financing.`);
    }

    const payload: Record<string, any> = {
      [cleanCol]: cleanVal
    };

    let newFy = 0;
    for (const m of validMonthCols) {
      if (m === cleanCol) newFy += cleanVal;
      else newFy += Number(currentRow[m] || 0);
    }
    payload.fy_to_date = Math.round(newFy * 100) / 100;

    const { data: updated, error: updErr } = await supabase
      .from('fss_financing')
      .update(payload)
      .eq('id', currentRow.id)
      .select()
      .single();

    if (updErr) {
      console.error('Error updating fss_financing record:', updErr);
      throw updErr;
    }

    const { data: allRows } = await supabase
      .from('fss_financing')
      .select('*')
      .order('id', { ascending: true });

    const detailRows = (allRows || []).filter(
      (r: any) => !r.financing_name?.toLowerCase().includes('total') && r.id !== 3
    );
    const currentTotalRow = (allRows || []).find(
      (r: any) => r.financing_name?.toLowerCase().includes('total') || r.id === 3
    );

    let updatedTotalRow: any = null;
    if (currentTotalRow) {
      const tPayload: Record<string, any> = {};
      let tFy = 0;
      for (const m of validMonthCols) {
        const sumM = detailRows.reduce((acc: number, r: any) => acc + (Number(r[m]) || 0), 0);
        tPayload[m] = Math.round(sumM * 100) / 100;
        tFy += tPayload[m];
      }
      tPayload.fy_to_date = Math.round(tFy * 100) / 100;
      const { data: tUpdated } = await supabase
        .from('fss_financing')
        .update(tPayload)
        .eq('id', currentTotalRow.id)
        .select()
        .single();
      updatedTotalRow = tUpdated;
    }

    const { data: freshRows } = await supabase
      .from('fss_financing')
      .select('*')
      .order('id', { ascending: true });

    return {
      updatedRow: updated,
      totalRow: updatedTotalRow,
      allRows: freshRows || []
    };
  },

  /**
   * Adds a new Financing entry to public.fss_financing
   */
  async addFinancing(
    financingName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = (financingName || '').trim();
    if (!trimmed) throw new Error('Financing name is required.');

    const isTotal = trimmed.toLowerCase().includes('total');
    if (isTotal) {
      throw new Error('Cannot add a record named "Total" as it is reserved for the subtotal.');
    }

    const validMonthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];

    const { data: existing } = await supabase
      .from('fss_financing')
      .select('*')
      .ilike('financing_name', trimmed);

    if (existing && existing.length > 0) {
      const ex = existing[0];
      const payload: Record<string, any> = {};
      let fy = 0;
      for (const m of validMonthCols) {
        if (monthlyAmounts[m] !== undefined) {
          payload[m] = Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100;
        } else {
          payload[m] = Number(ex[m] || 0);
        }
        fy += payload[m];
      }
      payload.fy_to_date = Math.round(fy * 100) / 100;

      const { data: updated, error: updErr } = await supabase
        .from('fss_financing')
        .update(payload)
        .eq('id', ex.id)
        .select()
        .single();
      if (updErr) throw updErr;
      return updated;
    }

    const { data: maxIdRow } = await supabase
      .from('fss_financing')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);

    const nextId = (maxIdRow && maxIdRow[0] && maxIdRow[0].id) ? maxIdRow[0].id + 1 : 1;

    let totalFy = 0;
    const insertPayload: Record<string, any> = {
      id: nextId,
      financing_name: trimmed
    };
    for (const m of validMonthCols) {
      const v = monthlyAmounts[m] !== undefined ? Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100 : 0;
      insertPayload[m] = v;
      totalFy += v;
    }
    insertPayload.fy_to_date = Math.round(totalFy * 100) / 100;

    const { data: inserted, error: insErr } = await supabase
      .from('fss_financing')
      .insert(insertPayload)
      .select()
      .single();

    if (insErr) {
      console.error('Error inserting new financing row:', insErr);
      throw insErr;
    }

    const { data: allRows } = await supabase.from('fss_financing').select('*');
    const detailRows = (allRows || []).filter(
      (r: any) => !r.financing_name?.toLowerCase().includes('total')
    );
    const currentTotalRow = (allRows || []).find(
      (r: any) => r.financing_name?.toLowerCase().includes('total')
    );

    if (currentTotalRow) {
      const tPayload: Record<string, any> = {};
      let tFy = 0;
      for (const m of validMonthCols) {
        const sumM = detailRows.reduce((acc: number, r: any) => acc + (Number(r[m]) || 0), 0);
        tPayload[m] = Math.round(sumM * 100) / 100;
        tFy += tPayload[m];
      }
      tPayload.fy_to_date = Math.round(tFy * 100) / 100;
      await supabase
        .from('fss_financing')
        .update(tPayload)
        .eq('id', currentTotalRow.id);
    }

    return inserted;
  },

  /**
   * Updates a single cell (month column) for an Operating Receipt record in public.fss_operation_receipts by id,
   * recalculates fy_to_date, the total row (Operation Receipts), and returns the updated dataset.
   */
  async updateOperationReceiptCell(
    idOrName: number | string,
    monthCol: string,
    newValue: number | string
  ): Promise<{ updatedRow: any; totalRow: any; allRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const validMonthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];
    const cleanCol = (monthCol || '').toLowerCase().trim();
    if (!validMonthCols.includes(cleanCol)) {
      throw new Error(`Invalid month column: ${monthCol}`);
    }

    const numVal = Number(newValue);
    const cleanVal = isNaN(numVal) || numVal < 0 ? 0 : Math.round(numVal * 100) / 100;

    let targetId: number | null = typeof idOrName === 'number' ? idOrName : null;
    if (!targetId && !isNaN(Number(idOrName))) {
      targetId = Number(idOrName);
    }

    let currentRow: any = null;
    if (targetId) {
      const { data, error } = await supabase
        .from('fss_operation_receipts')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();
      if (error) throw error;
      currentRow = data;
    } else {
      const { data, error } = await supabase
        .from('fss_operation_receipts')
        .select('*')
        .ilike('receipt_name', String(idOrName).trim())
        .maybeSingle();
      if (error) throw error;
      currentRow = data;
      if (currentRow) targetId = currentRow.id;
    }

    if (!currentRow) {
      throw new Error(`Record "${idOrName}" not found in fss_operation_receipts.`);
    }

    const payload: Record<string, any> = {
      [cleanCol]: cleanVal
    };

    let newFy = 0;
    for (const m of validMonthCols) {
      if (m === cleanCol) newFy += cleanVal;
      else newFy += Number(currentRow[m] || 0);
    }
    payload.fy_to_date = Math.round(newFy * 100) / 100;

    const { data: updated, error: updErr } = await supabase
      .from('fss_operation_receipts')
      .update(payload)
      .eq('id', currentRow.id)
      .select()
      .single();

    if (updErr) {
      console.error('Error updating fss_operation_receipts record:', updErr);
      throw updErr;
    }

    const { data: allRows } = await supabase
      .from('fss_operation_receipts')
      .select('*')
      .order('id', { ascending: true });

    const detailRows = (allRows || []).filter(
      (r: any) => !r.receipt_name?.toLowerCase().includes('operation receipts') && r.id !== 5
    );
    const currentTotalRow = (allRows || []).find(
      (r: any) => r.receipt_name?.toLowerCase().includes('operation receipts') || r.id === 5
    );

    let updatedTotalRow: any = null;
    if (currentTotalRow) {
      const tPayload: Record<string, any> = {};
      let tFy = 0;
      for (const m of validMonthCols) {
        const sumM = detailRows.reduce((acc: number, r: any) => acc + (Number(r[m]) || 0), 0);
        tPayload[m] = Math.round(sumM * 100) / 100;
        tFy += tPayload[m];
      }
      tPayload.fy_to_date = Math.round(tFy * 100) / 100;
      const { data: tUpdated } = await supabase
        .from('fss_operation_receipts')
        .update(tPayload)
        .eq('id', currentTotalRow.id)
        .select()
        .single();
      updatedTotalRow = tUpdated;
    }

    const { data: freshRows } = await supabase
      .from('fss_operation_receipts')
      .select('*')
      .order('id', { ascending: true });

    return {
      updatedRow: updated,
      totalRow: updatedTotalRow,
      allRows: freshRows || []
    };
  },

  /**
   * Adds a new Operating Receipt entry to public.fss_operation_receipts
   */
  async addOperationReceipt(
    receiptName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = (receiptName || '').trim();
    if (!trimmed) throw new Error('Receipt name is required.');

    const isTotal = trimmed.toLowerCase().includes('operation receipts') || trimmed.toLowerCase().includes('operating receipts');
    if (isTotal) {
      throw new Error('Cannot add a record named "Operation Receipts" as it is reserved for the subtotal.');
    }

    const validMonthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];

    const { data: existing } = await supabase
      .from('fss_operation_receipts')
      .select('*')
      .ilike('receipt_name', trimmed);

    if (existing && existing.length > 0) {
      const ex = existing[0];
      const payload: Record<string, any> = {};
      let fy = 0;
      for (const m of validMonthCols) {
        if (monthlyAmounts[m] !== undefined) {
          payload[m] = Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100;
        } else {
          payload[m] = Number(ex[m] || 0);
        }
        fy += payload[m];
      }
      payload.fy_to_date = Math.round(fy * 100) / 100;

      const { data: updated, error: updErr } = await supabase
        .from('fss_operation_receipts')
        .update(payload)
        .eq('id', ex.id)
        .select()
        .single();
      if (updErr) throw updErr;
      return updated;
    }

    const { data: maxIdRow } = await supabase
      .from('fss_operation_receipts')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);

    const nextId = (maxIdRow && maxIdRow[0] && maxIdRow[0].id) ? maxIdRow[0].id + 1 : 1;

    let totalFy = 0;
    const insertPayload: Record<string, any> = {
      id: nextId,
      receipt_name: trimmed,
      last_fy_to_date: 0
    };
    for (const m of validMonthCols) {
      const v = monthlyAmounts[m] !== undefined ? Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100 : 0;
      insertPayload[m] = v;
      totalFy += v;
    }
    insertPayload.fy_to_date = Math.round(totalFy * 100) / 100;

    const { data: inserted, error: insErr } = await supabase
      .from('fss_operation_receipts')
      .insert(insertPayload)
      .select()
      .single();

    if (insErr) {
      console.error('Error inserting new operation receipt row:', insErr);
      throw insErr;
    }

    const { data: allRows } = await supabase.from('fss_operation_receipts').select('*');
    const detailRows = (allRows || []).filter(
      (r: any) => !r.receipt_name?.toLowerCase().includes('operation receipts')
    );
    const currentTotalRow = (allRows || []).find(
      (r: any) => r.receipt_name?.toLowerCase().includes('operation receipts')
    );

    if (currentTotalRow) {
      const tPayload: Record<string, any> = {};
      let tFy = 0;
      for (const m of validMonthCols) {
        const sumM = detailRows.reduce((acc: number, r: any) => acc + (Number(r[m]) || 0), 0);
        tPayload[m] = Math.round(sumM * 100) / 100;
        tFy += tPayload[m];
      }
      tPayload.fy_to_date = Math.round(tFy * 100) / 100;
      await supabase
        .from('fss_operation_receipts')
        .update(tPayload)
        .eq('id', currentTotalRow.id);
    }

    return inserted;
  },

  /**
   * Syncs / inserts Cashflow Inflow data into fss_operation_receipts, fss_income, and fss_financing in Supabase,
   * then fetches the fresh fss_cash_inflow view.
   */
  async syncCashflowInflowToSupabase(
    dataPayloads: {
      operationReceipts?: any[];
      income?: any[];
      financing?: any[];
    }
  ): Promise<{
    operationReceipts: any[];
    income: any[];
    financing: any[];
    cashInflow: any[];
  }> {
    if (!supabase) throw new Error('Supabase is not configured.');

    const syncedOpRecs: any[] = [];
    if (dataPayloads.operationReceipts && dataPayloads.operationReceipts.length > 0) {
      for (const row of dataPayloads.operationReceipts) {
        const payload = { ...row };
        delete payload.created_at;
        let syncedRow = null;
        if (payload.id) {
          const { data: updated, error: updErr } = await supabase
            .from('fss_operation_receipts')
            .update(payload)
            .eq('id', payload.id)
            .select();
          if (!updErr && updated && updated.length > 0) {
            syncedRow = updated[0];
          }
        }
        if (!syncedRow) {
          const { data: inserted, error: insErr } = await supabase
            .from('fss_operation_receipts')
            .insert(payload)
            .select();
          if (!insErr && inserted && inserted.length > 0) {
            syncedRow = inserted[0];
          } else if (insErr) {
            console.error(`Error saving operation receipt (${row.receipt_name}):`, insErr);
          }
        }
        if (syncedRow) syncedOpRecs.push(syncedRow);
      }
    }

    const syncedIncome: any[] = [];
    if (dataPayloads.income && dataPayloads.income.length > 0) {
      for (const row of dataPayloads.income) {
        const payload = { ...row };
        delete payload.created_at;
        delete payload.fy_to_date;
        let syncedRow = null;
        if (payload.id) {
          const { data: updated, error: updErr } = await supabase
            .from('fss_income')
            .update(payload)
            .eq('id', payload.id)
            .select();
          if (!updErr && updated && updated.length > 0) {
            syncedRow = updated[0];
          }
        }
        if (!syncedRow) {
          const { data: inserted, error: insErr } = await supabase
            .from('fss_income')
            .insert(payload)
            .select();
          if (!insErr && inserted && inserted.length > 0) {
            syncedRow = inserted[0];
          } else if (insErr) {
            console.error(`Error saving income (${row.income_name}):`, insErr);
          }
        }
        if (syncedRow) syncedIncome.push(syncedRow);
      }
    }

    const syncedFinancing: any[] = [];
    if (dataPayloads.financing && dataPayloads.financing.length > 0) {
      for (const row of dataPayloads.financing) {
        const payload = { ...row };
        delete payload.created_at;
        let syncedRow = null;
        if (payload.id) {
          const { data: updated, error: updErr } = await supabase
            .from('fss_financing')
            .update(payload)
            .eq('id', payload.id)
            .select();
          if (!updErr && updated && updated.length > 0) {
            syncedRow = updated[0];
          }
        }
        if (!syncedRow) {
          const { data: inserted, error: insErr } = await supabase
            .from('fss_financing')
            .insert(payload)
            .select();
          if (!insErr && inserted && inserted.length > 0) {
            syncedRow = inserted[0];
          } else if (insErr) {
            console.error(`Error saving financing (${row.financing_name}):`, insErr);
          }
        }
        if (syncedRow) syncedFinancing.push(syncedRow);
      }
    }

    try {
      const { data: cfView } = await supabase.from('fss_cash_inflow').select('*');
      return {
        operationReceipts: syncedOpRecs.length ? syncedOpRecs : await this.loadOperationReceiptsFromSupabase(),
        income: syncedIncome.length ? syncedIncome : await this.loadIncomeFromSupabase(),
        financing: syncedFinancing.length ? syncedFinancing : await this.loadFinancingFromSupabase(),
        cashInflow: cfView || []
      };
    } catch {
      return {
        operationReceipts: syncedOpRecs,
        income: syncedIncome,
        financing: syncedFinancing,
        cashInflow: await this.loadCashInflowFromSupabase()
      };
    }
  },

  /**
   * Loads all rows from public.fss_outflow_oc_people
   */
  async loadPeopleFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_outflow_oc_people')
        .select('*')
        .order('id', { ascending: true });
      if (error) {
        console.error('Error loading fss_outflow_oc_people from Supabase:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception loading fss_outflow_oc_people from Supabase:', err);
      return [];
    }
  },

  /**
   * Loads all rows from public.fss_outflow_oc_people_report (SQL View)
   */
  async loadPeopleReportFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_outflow_oc_people_report')
        .select('*');
      if (error) {
        console.error('Error loading fss_outflow_oc_people_report from Supabase:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception loading fss_outflow_oc_people_report from Supabase:', err);
      return [];
    }
  },

  /**
   * Updates a single cell (month column) for an Operating Costs - People record in public.fss_outflow_oc_people by id.
   * Note: The view fss_outflow_oc_people_report automatically recalculates fy_to_date, share_pct, and People Total.
   */
  async updatePeopleCell(
    idOrCategory: number | string,
    monthCol: string,
    newValue: number | string
  ): Promise<{ updatedRow: any; allRows: any[]; reportRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const validMonthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];
    const cleanCol = (monthCol || '').toLowerCase().trim();
    if (!validMonthCols.includes(cleanCol)) {
      throw new Error(`Invalid month column: ${monthCol}`);
    }

    const numVal = Number(newValue);
    const cleanVal = isNaN(numVal) || numVal < 0 ? 0 : Math.round(numVal * 100) / 100;

    let targetId: number | null = typeof idOrCategory === 'number' ? idOrCategory : null;
    if (!targetId && !isNaN(Number(idOrCategory))) {
      targetId = Number(idOrCategory);
    }

    let currentRow: any = null;
    if (targetId) {
      const { data, error } = await supabase
        .from('fss_outflow_oc_people')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();
      if (error) throw error;
      currentRow = data;
    } else {
      const { data, error } = await supabase
        .from('fss_outflow_oc_people')
        .select('*')
        .ilike('category', String(idOrCategory).trim())
        .maybeSingle();
      if (error) throw error;
      currentRow = data;
      if (currentRow) targetId = currentRow.id;
    }

    if (!currentRow) {
      throw new Error(`Record "${idOrCategory}" not found in fss_outflow_oc_people.`);
    }

    const payload: Record<string, any> = {
      [cleanCol]: cleanVal
    };

    const { data: updated, error: updErr } = await supabase
      .from('fss_outflow_oc_people')
      .update(payload)
      .eq('id', currentRow.id)
      .select()
      .single();

    if (updErr) {
      console.error('Error updating fss_outflow_oc_people record:', updErr);
      throw updErr;
    }

    const [allRows, reportRows] = await Promise.all([
      this.loadPeopleFromSupabase(),
      this.loadPeopleReportFromSupabase()
    ]);

    return {
      updatedRow: updated,
      allRows,
      reportRows
    };
  },

  /**
   * Adds a new Operating Costs - People expense into public.fss_outflow_oc_people,
   * avoiding duplicate inserts.
   */
  async addPeopleExpense(
    categoryName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = (categoryName || '').trim();
    if (!trimmed) throw new Error('Category name is required.');

    const isTotal = trimmed.toLowerCase().includes('total');
    if (isTotal) {
      throw new Error('Cannot add a record named "Total" as it is reserved for the subtotal.');
    }

    const validMonthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];

    const { data: existing, error: existingErr } = await supabase
      .from('fss_outflow_oc_people')
      .select('*')
      .ilike('category', trimmed);
    if (existingErr) throw existingErr;

    if (existing && existing.length > 0) {
      const ex = existing[0];
      const payload: Record<string, any> = {};
      for (const m of validMonthCols) {
        if (monthlyAmounts[m] !== undefined) {
          payload[m] = Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100;
        } else {
          payload[m] = Number(ex[m] || 0);
        }
      }

      const { data: updated, error: updErr } = await supabase
        .from('fss_outflow_oc_people')
        .update(payload)
        .eq('id', ex.id)
        .select()
        .single();
      if (updErr) throw updErr;
      return updated;
    }

    const insertPayload: Record<string, any> = {
      category: trimmed
    };
    for (const m of validMonthCols) {
      const v = monthlyAmounts[m] !== undefined ? Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100 : 0;
      insertPayload[m] = v;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('fss_outflow_oc_people')
      .insert(insertPayload)
      .select()
      .single();

    if (insErr) {
      console.error('Error inserting new people row:', insErr);
      throw insErr;
    }

    return inserted;
  },

  /**
   * Syncs / inserts People outflow rows to public.fss_outflow_oc_people
   */
  async syncPeopleToSupabase(peopleRows: any[]): Promise<{
    people: any[];
    peopleReport: any[];
  }> {
    if (!supabase) throw new Error('Supabase is not configured.');

    const tableName = 'fss_outflow_oc_people';
    const monthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];
    const normalizeCategory = (value: any) => String(value || '').trim().toLowerCase();
    const desiredRows = (peopleRows || []).filter((row: any) => normalizeCategory(row.category));
    const desiredNames = new Set(desiredRows.map((row: any) => normalizeCategory(row.category)));
    const { data: existingRows, error: loadError } = await supabase.from(tableName).select('*');
    if (loadError) throw loadError;

    for (const existing of existingRows || []) {
      if (!desiredNames.has(normalizeCategory(existing.category))) {
        const { error } = await supabase.from(tableName).delete().eq('id', existing.id);
        if (error) {
          console.error(`Error deleting stale People row "${existing.category}":`, error);
          throw error;
        }
      }
    }

    for (const row of desiredRows) {
      const category = String(row.category).trim();
      const payload: Record<string, any> = { category };
      for (const month of monthCols) {
        const value = Number(row[month] ?? 0);
        if (!Number.isFinite(value)) {
          throw new Error(`Invalid ${month} value for People row "${category}".`);
        }
        payload[month] = Math.round(value * 100) / 100;
      }

      const existing = (existingRows || []).find((item: any) =>
        normalizeCategory(item.category) === normalizeCategory(category)
      );
      const result = existing
        ? await supabase.from(tableName).update(payload).eq('id', existing.id)
        : await supabase.from(tableName).insert(payload);
      if (result.error) {
        console.error(`Error saving People row "${category}" to Supabase:`, result.error);
        throw result.error;
      }
    }

    const [
      { data: people, error: verifyPeopleError },
      { data: peopleReport, error: verifyReportError }
    ] = await Promise.all([
      supabase.from(tableName).select('*'),
      supabase.from('fss_outflow_oc_people_report').select('*')
    ]);
    if (verifyPeopleError) throw verifyPeopleError;
    if (verifyReportError) throw verifyReportError;

    for (const row of desiredRows) {
      const persisted = (people || []).find((item: any) =>
        normalizeCategory(item.category) === normalizeCategory(row.category)
      );
      const reported = (peopleReport || []).find((item: any) =>
        normalizeCategory(item.category) === normalizeCategory(row.category)
      );
      if (!persisted || !reported) {
        throw new Error(`People row "${row.category}" is missing from the base table or report view after sync.`);
      }
      for (const month of monthCols) {
        const expected = Math.round(Number(row[month] ?? 0) * 100) / 100;
        if (Math.round(Number(persisted[month] ?? 0) * 100) / 100 !== expected) {
          throw new Error(`People row "${row.category}" did not persist the expected ${month} value.`);
        }
        if (Math.round(Number(reported[month] ?? 0) * 100) / 100 !== expected) {
          throw new Error(`People report row "${row.category}" does not match ${month} in the base table.`);
        }
      }
    }

    return { people, peopleReport };
  },

  /**
   * Loads all rows from public.fss_outflow_project_cost (FSS Outflow - Project Costs)
   */
  async loadProjectCostFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_outflow_project_cost')
        .select('*')
        .order('category', { ascending: true });
      if (error) {
        console.error('Error loading fss_outflow_project_cost from Supabase:', error);
        return [];
      }
      if (!data || data.length === 0) return [];
      return recomputeProjectCostFyAndShares(data);
    } catch (err) {
      console.error('Exception loading fss_outflow_project_cost from Supabase:', err);
      return [];
    }
  },

  /**
   * Updates a single cell (month column) for a Project Costs outflow record in public.fss_outflow_project_cost by category.
   * Recalculates fy_to_date and shares, then returns the updated dataset.
   */
  async updateProjectCostCell(
    idOrCategory: number | string,
    monthCol: string,
    newValue: number | string
  ): Promise<{ updatedRow: any; allRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const validMonthCols = PROJECT_COST_MONTH_COLS;
    const cleanCol = (monthCol || '').toLowerCase().trim();
    if (!validMonthCols.includes(cleanCol)) {
      throw new Error(`Invalid month column: ${monthCol}`);
    }

    const numVal = Number(newValue);
    const isJanFebMar = ['jan_26', 'feb_26', 'mar_26'].includes(cleanCol);
    const cleanVal = isNaN(numVal) || numVal < 0 ? (isJanFebMar ? null : 0) : Math.round(numVal * 100) / 100;

    const categoryKey = String(idOrCategory ?? '').trim();
    const { data: currentRow, error: selErr } = await supabase
      .from('fss_outflow_project_cost')
      .select('*')
      .ilike('category', categoryKey)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!currentRow) {
      throw new Error(`Record "${idOrCategory}" not found in fss_outflow_project_cost.`);
    }

    const { data: updated, error: updErr } = await supabase
      .from('fss_outflow_project_cost')
      .update({ [cleanCol]: cleanVal })
      .eq('category', currentRow.category)
      .select()
      .single();

    if (updErr) {
      console.error('Error updating fss_outflow_project_cost record:', updErr);
      throw updErr;
    }

    const { data: allRaw } = await supabase
      .from('fss_outflow_project_cost')
      .select('*')
      .order('category', { ascending: true });
    const recomputed = recomputeProjectCostFyAndShares(allRaw || []);

    const parentRow = recomputed.find((r: any) => String(r.category || '').toLowerCase() === 'project costs');
    if (parentRow) {
      const parentPayload: Record<string, any> = {
        fy_to_date: parentRow.fy_to_date,
        shares: parentRow.shares
      };
      for (const m of PROJECT_COST_MONTH_COLS) {
        parentPayload[m] = parentRow[m] !== undefined ? parentRow[m] : null;
      }
      await supabase
        .from('fss_outflow_project_cost')
        .update(parentPayload)
        .eq('category', parentRow.category);
    }

    const updatedComputed = recomputed.find((r: any) => r.category === currentRow.category) || updated;
    if (updatedComputed) {
      await supabase
        .from('fss_outflow_project_cost')
        .update({
          fy_to_date: updatedComputed.fy_to_date,
          shares: updatedComputed.shares
        })
        .eq('category', currentRow.category);
    }

    return { updatedRow: updatedComputed, allRows: recomputed };
  },

  /**
   * Adds a new Project Costs outflow into public.fss_outflow_project_cost,
   * avoiding duplicate inserts (updates when the category already exists).
   */
  async addProjectCostExpense(
    categoryName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = (categoryName || '').trim();
    if (!trimmed) throw new Error('Category name is required.');

    const isTotal = trimmed.toLowerCase().includes('total');
    if (isTotal) {
      throw new Error('Cannot add a record named "Total" as it is reserved for the subtotal.');
    }

    const payload: Record<string, any> = { category: trimmed };
    for (const m of PROJECT_COST_MONTH_COLS) {
      const v = monthlyAmounts[m] !== undefined ? Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100 : 0;
      payload[m] = v;
    }

    const { data: existing, error: selErr } = await supabase
      .from('fss_outflow_project_cost')
      .select('*')
      .ilike('category', trimmed);
    if (selErr) throw selErr;

    if (existing && existing.length > 0) {
      const ex = existing[0];
      const updatePayload: Record<string, any> = {};
      for (const m of PROJECT_COST_MONTH_COLS) {
        if (monthlyAmounts[m] !== undefined) {
          updatePayload[m] = Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100;
        } else {
          updatePayload[m] = Number(ex[m] || 0);
        }
      }
      const { data: updated, error: updErr } = await supabase
        .from('fss_outflow_project_cost')
        .update(updatePayload)
        .eq('category', ex.category)
        .select()
        .single();
      if (updErr) throw updErr;
      const allRows = await this.loadProjectCostFromSupabase();
      return allRows.find((r: any) => r.category === ex.category) || updated;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('fss_outflow_project_cost')
      .insert(payload)
      .select()
      .single();

    if (insErr) {
      console.error('Error inserting new project cost row:', insErr);
      throw insErr;
    }

    const allRows = await this.loadProjectCostFromSupabase();
    return allRows.find((r: any) => r.category === trimmed) || inserted;
  },

  /**
   * Syncs / upserts Project Costs outflow rows into public.fss_outflow_project_cost
   * using the category name as the stable identifier (no duplicate category records).
   */
  async syncProjectCostToSupabase(projectCostRows: any[]): Promise<{ projectCost: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');

    const rows = recomputeProjectCostFyAndShares(projectCostRows || []);
    const synced: any[] = [];

    try {
      const computedNames = new Set(rows.map((r: any) => String(r.category || '').trim().toLowerCase()));
      const { data: existingRows } = await supabase.from('fss_outflow_project_cost').select('category');
      for (const er of existingRows || []) {
        if (!computedNames.has(String(er.category || '').trim().toLowerCase())) {
          await supabase.from('fss_outflow_project_cost').delete().eq('category', er.category);
        }
      }
    } catch (e) { console.warn('Stale cleanup failed for project_cost:', e); }

    for (const row of rows) {
      const category = (row.category || '').trim();
      if (!category) continue;
      const payload: Record<string, any> = { category };
      for (const m of PROJECT_COST_MONTH_COLS) {
        if (['jan_26', 'feb_26', 'mar_26'].includes(m)) {
          payload[m] = null;
        } else {
          payload[m] = row[m] !== null && row[m] !== undefined ? Math.round(Number(row[m]) * 100) / 100 : 0;
        }
      }
      payload.fy_to_date = Number(row.fy_to_date || projectCostFyToDate(row));
      payload.shares = Number(row.shares || 0);

      const { data: existing, error: selErr } = await supabase
        .from('fss_outflow_project_cost')
        .select('*')
        .ilike('category', category);
      if (selErr) throw selErr;

      if (existing && existing.length > 0) {
        const ex = existing[0];
        // Preserve the existing category identifier on update (stable key).
        payload.category = ex.category;
        const { error: updErr } = await supabase
          .from('fss_outflow_project_cost')
          .update(payload)
          .eq('category', ex.category);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase
          .from('fss_outflow_project_cost')
          .insert(payload);
        if (insErr) throw insErr;
      }
      synced.push(row);
    }

    const allRows = await this.loadProjectCostFromSupabase();
    return { projectCost: allRows };
  },

  /** Keep the secondary Project Costs table as a mirror of the UI-computed rows. */
  async syncProjectCost2ToSupabase(projectCostRows: any[]): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured.');

    const rows = recomputeProjectCostFyAndShares(projectCostRows || []);
    const normalized = rows
      .map((row: any) => ({
        ...row,
        category: String(row.category || '').trim().toLowerCase() === 'project costs'
          ? 'Project Costs Total'
          : String(row.category || '').trim()
      }))
      .filter((row: any) => row.category);
    const categoryKey = (category: any) => String(category || '').trim().toLowerCase();
    const wanted = new Set(normalized.map((row: any) => categoryKey(row.category)));

    const { data: existingRows, error: loadError } = await supabase
      .from('fss_outflow_project_cost_2')
      .select('id, category');
    if (loadError) throw loadError;

    for (const existing of existingRows || []) {
      if (!wanted.has(categoryKey(existing.category))) {
        const { error } = await supabase.from('fss_outflow_project_cost_2').delete().eq('id', existing.id);
        if (error) throw error;
      }
    }

    for (const row of normalized) {
      const payload: Record<string, any> = { category: row.category };
      for (const month of PROJECT_COST_MONTH_COLS) {
        const value = Number(row[month]);
        payload[month] = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
      }

      const existing = (existingRows || []).find((item: any) => categoryKey(item.category) === categoryKey(row.category));
      const query = existing
        ? supabase.from('fss_outflow_project_cost_2').update(payload).eq('id', existing.id)
        : supabase.from('fss_outflow_project_cost_2').insert(payload);
      const { error } = await query;
      if (error) throw error;
    }

    const { data, error } = await supabase.from('fss_outflow_project_cost_2').select('*').order('id');
    if (error) throw error;
    return data || [];
  },

  /**
   * Loads all rows from public.fss_outflow_capex (FSS Outflow - Capex)
   */
  async loadCapexFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('fss_outflow_capex')
      .select('*')
      .order('category', { ascending: true });
    if (error) {
      console.error('Error loading fss_outflow_capex from Supabase:', error);
      throw error;
    }
    return data || [];
  },

  /**
   * Updates a single cell (month column) for a Capex outflow record in public.fss_outflow_capex by category.
   * Recalculates fy_to_date and shares, then returns the updated dataset.
   */
  async updateCapexCell(
    idOrCategory: number | string,
    monthCol: string,
    newValue: number | string
  ): Promise<{ updatedRow: any; allRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const validMonthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];
    const cleanCol = (monthCol || '').toLowerCase().trim();
    if (!validMonthCols.includes(cleanCol)) {
      throw new Error(`Invalid month column: ${monthCol}`);
    }

    const numVal = Number(newValue);
    const cleanVal = isNaN(numVal) || numVal < 0 ? 0 : Math.round(numVal * 100) / 100;

    const categoryKey = String(idOrCategory ?? '').trim();
    const { data: currentRow, error: selErr } = await supabase
      .from('fss_outflow_capex')
      .select('*')
      .ilike('category', categoryKey)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!currentRow) {
      throw new Error(`Record "${idOrCategory}" not found in fss_outflow_capex.`);
    }

    const payload: Record<string, any> = {
      [cleanCol]: cleanVal
    };

    const { data: updated, error: updErr } = await supabase
      .from('fss_outflow_capex')
      .update(payload)
      .eq('category', currentRow.category)
      .select()
      .single();

    if (updErr) {
      console.error('Error updating fss_outflow_capex record:', updErr);
      throw updErr;
    }

    const allRows = await this.loadCapexFromSupabase();
    const recomputed = recomputeCapexFyAndShares(allRows);
    const updatedRow = recomputed.find((r: any) => r.category === currentRow.category) || updated;

    return { updatedRow, allRows: recomputed };
  },

  /**
   * Adds a new Capex outflow into public.fss_outflow_capex,
   * avoiding duplicate inserts (updates when the category already exists).
   */
  async addCapexExpense(
    categoryName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = (categoryName || '').trim();
    if (!trimmed) throw new Error('Category name is required.');

    const isTotal = trimmed.toLowerCase().includes('total');
    if (isTotal) {
      throw new Error('Cannot add a record named "Total" as it is reserved for the subtotal.');
    }

    const payload: Record<string, any> = { category: trimmed };
    for (const m of CAPEX_MONTH_COLS) {
      const v = monthlyAmounts[m] !== undefined ? Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100 : 0;
      payload[m] = v;
    }

    const { data: existing, error: selErr } = await supabase
      .from('fss_outflow_capex')
      .select('*')
      .ilike('category', trimmed);
    if (selErr) throw selErr;

    if (existing && existing.length > 0) {
      const ex = existing[0];
      const updatePayload: Record<string, any> = {};
      for (const m of CAPEX_MONTH_COLS) {
        if (monthlyAmounts[m] !== undefined) {
          updatePayload[m] = Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100;
        } else {
          updatePayload[m] = Number(ex[m] || 0);
        }
      }
      const { data: updated, error: updErr } = await supabase
        .from('fss_outflow_capex')
        .update(updatePayload)
        .eq('category', ex.category)
        .select()
        .single();
      if (updErr) throw updErr;
      const allRows = await this.loadCapexFromSupabase();
      return allRows.find((r: any) => r.category === ex.category) || updated;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('fss_outflow_capex')
      .insert(payload)
      .select()
      .single();

    if (insErr) {
      console.error('Error inserting new capex row:', insErr);
      throw insErr;
    }

    const allRows = await this.loadCapexFromSupabase();
    return allRows.find((r: any) => r.category === trimmed) || inserted;
  },

  /**
   * Syncs / upserts Capex outflow rows into public.fss_outflow_capex
   * using the category name as the stable identifier (no duplicate category records).
   */
  async syncCapexToSupabase(capexRows: any[]): Promise<{ capex: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');

    const rows = recomputeCapexFyAndShares(capexRows || []);
    const synced: any[] = [];

    const normalizeCategory = (category: any) => String(category || '').trim().toLowerCase();

    for (const row of rows) {
      const category = (row.category || '').trim();
      if (!category) continue;
      const payload: Record<string, any> = { category };
      for (const m of CAPEX_MONTH_COLS) {
        const v = row[m];
        payload[m] = (v === null || v === undefined) ? null : Math.round(Number(v || 0) * 100) / 100;
      }
      payload.fy_to_date = Number(row.fy_to_date || capexFyToDate(row));
      payload.shares = Number(row.shares || 0);

      const { data: existing, error: selErr } = await supabase
        .from('fss_outflow_capex')
        .select('*')
        .ilike('category', category);
      if (selErr) throw selErr;

      if (existing && existing.length > 0) {
        const ex = existing[0];
        payload.category = ex.category;
        const { error: updErr } = await supabase
          .from('fss_outflow_capex')
          .update(payload)
          .eq('category', ex.category);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase
          .from('fss_outflow_capex')
          .insert(payload);
        if (insErr) throw insErr;
      }
      synced.push(row);
    }

    const allRows = await this.loadCapexFromSupabase();
    for (const row of rows) {
      const persisted = allRows.find((r: any) => normalizeCategory(r.category) === normalizeCategory(row.category));
      if (!persisted) {
        throw new Error(`Capex row "${row.category}" was not found after syncing to Supabase.`);
      }
      for (const month of CAPEX_MONTH_COLS) {
        const expected = row[month];
        const actual = persisted[month];
        const matches = expected == null
          ? actual == null
          : Number.isFinite(Number(actual)) && Math.abs(Number(actual) - Number(expected)) < 0.01;
        if (!matches) {
          throw new Error(`Capex row "${row.category}" did not save the expected ${month} value to Supabase.`);
        }
      }
    }
    return { capex: allRows };
  },

  /** Syncs the same UI Capex rows into the secondary fss_outflow_capex_2 table. */
  async syncCapex2ToSupabase(capexRows: any[]): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const rows = recomputeCapexFyAndShares(capexRows || []).map((row: any) => ({
      ...row,
      category: String(row.category || '').trim().toLowerCase() === 'capex' ? 'Capex Total' : row.category
    }));
    const normalizeCategory = (category: any) => String(category || '').trim().toLowerCase();
    const { data: existingRows, error: existingErr } = await supabase
      .from('fss_outflow_capex_2')
      .select('id, category');
    if (existingErr) throw existingErr;

    const computedNames = new Set(rows.map((row: any) => normalizeCategory(row.category)));
    for (const existing of existingRows || []) {
      if (!computedNames.has(normalizeCategory(existing.category))) {
        const { error } = await supabase.from('fss_outflow_capex_2').delete().eq('id', existing.id);
        if (error) throw error;
      }
    }

    for (const row of rows) {
      const category = String(row.category || '').trim();
      if (!category) continue;
      const payload: Record<string, any> = { category };
      for (const month of CAPEX_MONTH_COLS) {
        payload[month] = row[month] == null ? null : Math.round(Number(row[month] || 0) * 100) / 100;
      }
      const { data: existing, error: selectErr } = await supabase
        .from('fss_outflow_capex_2')
        .select('id, category')
        .ilike('category', category);
      if (selectErr) throw selectErr;
      if (existing && existing.length > 0) {
        const { error } = await supabase.from('fss_outflow_capex_2').update(payload).eq('id', existing[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fss_outflow_capex_2').insert(payload);
        if (error) throw error;
      }
    }

    const { data: allRows, error: loadErr } = await supabase.from('fss_outflow_capex_2').select('*').order('category', { ascending: true });
    if (loadErr) throw loadErr;
    return allRows || [];
  },

  /**
   * Loads all rows from public.fss_outflow_financing_and_owner (FSS Outflow - Financing & owner)
   */
  async loadFinancingAndOwnerFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_outflow_financing_and_owner')
        .select('*')
        .order('category', { ascending: true });
      if (error) {
        console.error('Error loading fss_outflow_financing_and_owner from Supabase:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception loading fss_outflow_financing_and_owner from Supabase:', err);
      return [];
    }
  },

  /**
   * Updates a single cell (month column) for a Financing & owner outflow record in public.fss_outflow_financing_and_owner by category.
   * Recalculates fy_to_date and shares, then returns the updated dataset.
   */
  async updateFinancingAndOwnerCell(
    idOrCategory: number | string,
    monthCol: string,
    newValue: number | string
  ): Promise<{ updatedRow: any; allRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const validMonthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];
    const cleanCol = (monthCol || '').toLowerCase().trim();
    if (!validMonthCols.includes(cleanCol)) {
      throw new Error(`Invalid month column: ${monthCol}`);
    }

    const numVal = Number(newValue);
    const cleanVal = isNaN(numVal) || numVal < 0 ? 0 : Math.round(numVal * 100) / 100;

    const categoryKey = String(idOrCategory ?? '').trim();
    const { data: currentRow, error: selErr } = await supabase
      .from('fss_outflow_financing_and_owner')
      .select('*')
      .ilike('category', categoryKey)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!currentRow) {
      throw new Error(`Record "${idOrCategory}" not found in fss_outflow_financing_and_owner.`);
    }

    const payload: Record<string, any> = {
      [cleanCol]: cleanVal
    };

    const { data: updated, error: updErr } = await supabase
      .from('fss_outflow_financing_and_owner')
      .update(payload)
      .eq('category', currentRow.category)
      .select()
      .single();

    if (updErr) {
      console.error('Error updating fss_outflow_financing_and_owner record:', updErr);
      throw updErr;
    }

    const allRows = await this.loadFinancingAndOwnerFromSupabase();
    const recomputed = recomputeFinancingOwnerFyAndShares(allRows);
    const updatedRow = recomputed.find((r: any) => r.category === currentRow.category) || updated;

    return { updatedRow, allRows: recomputed };
  },

  /**
   * Adds a new Financing & owner outflow into public.fss_outflow_financing_and_owner,
   * avoiding duplicate inserts (updates when the category already exists).
   */
  async addFinancingAndOwnerExpense(
    categoryName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = (categoryName || '').trim();
    if (!trimmed) throw new Error('Category name is required.');

    // Block manual "Total" rows
    if (trimmed.toLowerCase().includes('total')) {
      throw new Error('Cannot add a record named "Total" as it is reserved for the subtotal.');
    }

    const payload: Record<string, any> = { category: trimmed };
    for (const m of FINANCING_OWNER_MONTH_COLS) {
      const v = monthlyAmounts[m] !== undefined ? Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100 : 0;
      payload[m] = v;
    }

    const { data: existing, error: selErr } = await supabase
      .from('fss_outflow_financing_and_owner')
      .select('*')
      .ilike('category', trimmed);
    if (selErr) throw selErr;

    if (existing && existing.length > 0) {
      const ex = existing[0];
      const updatePayload: Record<string, any> = {};
      for (const m of FINANCING_OWNER_MONTH_COLS) {
        if (monthlyAmounts[m] !== undefined) {
          updatePayload[m] = Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100;
        } else {
          updatePayload[m] = Number(ex[m] || 0);
        }
      }
      const { data: updated, error: updErr } = await supabase
        .from('fss_outflow_financing_and_owner')
        .update(updatePayload)
        .eq('category', ex.category)
        .select()
        .single();
      if (updErr) throw updErr;
      const allRows = await this.loadFinancingAndOwnerFromSupabase();
      return allRows.find((r: any) => r.category === ex.category) || updated;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('fss_outflow_financing_and_owner')
      .insert(payload)
      .select()
      .single();

    if (insErr) {
      console.error('Error inserting new financing & owner row:', insErr);
      throw insErr;
    }

    const allRows = await this.loadFinancingAndOwnerFromSupabase();
    return allRows.find((r: any) => r.category === trimmed) || inserted;
  },

  /**
   * Syncs / upserts Financing & owner outflow rows into public.fss_outflow_financing_and_owner
   * using the category name as the stable identifier (no duplicate category records).
   */
  async syncFinancingAndOwnerToSupabase(financingAndOwnerRows: any[]): Promise<{ financingAndOwner: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');

    const rows = recomputeFinancingOwnerFyAndShares(financingAndOwnerRows || []);
    const normalize = (value: any) => String(value || '').trim().toLowerCase();
    const { data: existingRows, error: loadError } = await supabase
      .from('fss_outflow_financing_and_owner')
      .select('*');
    if (loadError) throw loadError;

    const desiredRows = new Map<string, any>();
    for (const row of rows) {
      const category = String(row.category || '').trim();
      if (category) desiredRows.set(normalize(category), { ...row, category });
    }
    const existingByCategory = new Map<string, any[]>();
    for (const row of existingRows || []) {
      const key = normalize(row.category);
      existingByCategory.set(key, [...(existingByCategory.get(key) || []), row]);
    }

    // Remove deleted UI categories and duplicate cloud rows. Match by category
    // rather than requiring an `id` column in this legacy table.
    for (const [key, matches] of existingByCategory) {
      if (!desiredRows.has(key) || matches.length > 1) {
        const categories = [...new Set(matches.map((row: any) => String(row.category || '')))];
        for (const category of categories) {
          const { error } = await supabase
            .from('fss_outflow_financing_and_owner')
            .delete()
            .eq('category', category);
          if (error) throw error;
        }
      }
    }

    const nullableNumber = (value: any): number | null => {
      if (value === null || value === undefined || String(value).trim() === '') return null;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) throw new Error(`Invalid Financing & Owner numeric value: ${value}`);
      return Math.round(numeric * 100) / 100;
    };

    for (const [key, row] of desiredRows) {
      const category = row.category;
      const payload: Record<string, any> = { category };
      for (const m of FINANCING_OWNER_MONTH_COLS) {
        payload[m] = nullableNumber(row[m]);
      }
      payload.fy_to_date = nullableNumber(row.fy_to_date ?? financingOwnerFyToDate(row));
      payload.shares = nullableNumber(row.shares);

      const matches = existingByCategory.get(key) || [];
      const existing = matches.length === 1 && desiredRows.has(key) ? matches[0] : null;
      const result = existing
        ? await supabase
          .from('fss_outflow_financing_and_owner')
          .update(payload)
          .eq('category', existing.category)
        : await supabase.from('fss_outflow_financing_and_owner').insert(payload);
      if (result.error) throw result.error;
    }

    const allRows = await this.loadFinancingAndOwnerFromSupabase();
    const loadedByCategory = new Map<string, any[]>();
    for (const row of allRows) {
      const key = normalize(row.category);
      loadedByCategory.set(key, [...(loadedByCategory.get(key) || []), row]);
    }
    for (const [key, row] of desiredRows) {
      const category = row.category;
      const matches = loadedByCategory.get(key) || [];
      if (matches.length !== 1) {
        throw new Error(`Financing & Owner row "${category}" was not uniquely reloaded from Supabase.`);
      }
      const loaded = matches[0];
      if (!loaded) {
        throw new Error(`Financing & Owner row "${category}" was not reloaded from Supabase.`);
      }
      for (const month of FINANCING_OWNER_MONTH_COLS) {
        const expectedValue = nullableNumber(row[month]);
        const loadedValue = nullableNumber(loaded[month]);
        if (expectedValue !== loadedValue) {
          throw new Error(`Financing & Owner value for "${category}" (${month}) did not match Supabase.`);
        }
      }
    }
    return { financingAndOwner: allRows };
  },

  /**
   * Loads all rows from public.fss_outflow_oc_office_fixed
   */
  async loadOfficeFixedFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_outflow_oc_office_fixed')
        .select('*')
        .order('id', { ascending: true });
      if (error) {
        console.error('Error loading fss_outflow_oc_office_fixed from Supabase:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception loading fss_outflow_oc_office_fixed from Supabase:', err);
      return [];
    }
  },

  /**
   * Updates a single cell (month column) for an Office Fixed record by expense_name.
   */
  async updateOfficeFixedCell(
    idOrExpense: number | string,
    monthCol: string,
    newValue: number | string
  ): Promise<{ updatedRow: any; allRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!OFFICE_FIXED_MONTH_COLS.includes(monthCol)) {
      throw new Error(`Invalid month column: ${monthCol}`);
    }
    const numVal = Number(newValue);
    const isJanFebMar = ['jan26', 'feb26', 'mar26'].includes(monthCol);
    const cleanVal = isNaN(numVal) || numVal < 0 ? (isJanFebMar ? null : 0) : Math.round(numVal * 100) / 100;

    let currentRow: any = null;
    const key = String(idOrExpense ?? '').trim();
    if (/^\d+$/.test(key)) {
      const { data } = await supabase.from('fss_outflow_oc_office_fixed').select('*').eq('id', Number(key)).maybeSingle();
      currentRow = data;
    } else {
      const { data } = await supabase.from('fss_outflow_oc_office_fixed').select('*').ilike('expense_name', key).maybeSingle();
      currentRow = data;
    }
    if (!currentRow) throw new Error(`Record "${idOrExpense}" not found in fss_outflow_oc_office_fixed.`);

    const { data: updated, error: updErr } = await supabase
      .from('fss_outflow_oc_office_fixed')
      .update({ [monthCol]: cleanVal })
      .eq('id', currentRow.id)
      .select()
      .single();
    if (updErr) throw updErr;

    const allRows = await this.loadOfficeFixedFromSupabase();
    const recomputed = recomputeOfficeFixedFyAndShares(allRows);
    // persist recomputed fy/share and parent totals
    const parentRow = recomputed.find((r: any) => String(r.expense_name || r.category || '').toLowerCase().includes('total') || String(r.expense_name || r.category || '').toLowerCase().includes('fixed'));
    if (parentRow) {
      const parentPayload: Record<string, any> = {
        fy_to_date: parentRow.fy_to_date,
        share: parentRow.share
      };
      for (const m of OFFICE_FIXED_MONTH_COLS) {
        if (['jan26', 'feb26', 'mar26'].includes(m)) {
          parentPayload[m] = null;
        } else {
          const sum = recomputed.filter((child: any) => child.id !== parentRow.id).reduce((s: number, child: any) => s + Number(child[m] || 0), 0);
          parentPayload[m] = Math.round(sum * 100) / 100;
        }
      }
      await supabase.from('fss_outflow_oc_office_fixed').update(parentPayload).eq('id', parentRow.id);
    }
    for (const r of recomputed) {
      if (!parentRow || r.id !== parentRow.id) {
        await supabase.from('fss_outflow_oc_office_fixed').update({ fy_to_date: r.fy_to_date, share: r.share }).eq('id', r.id);
      }
    }
    const updatedRow = recomputed.find((r: any) => r.id === currentRow.id) || updated;
    return { updatedRow, allRows: await this.loadOfficeFixedFromSupabase() };
  },

  /**
   * Adds a new Office Fixed expense.
   */
  async addOfficeFixedExpense(
    expenseName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = (expenseName || '').trim();
    if (!trimmed) throw new Error('Expense name is required.');

    const payload: Record<string, any> = { expense_name: trimmed };
    for (const m of OFFICE_FIXED_MONTH_COLS) {
      payload[m] = monthlyAmounts[m] !== undefined ? Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100 : 0;
    }

    const { data: existing } = await supabase
      .from('fss_outflow_oc_office_fixed')
      .select('*')
      .ilike('expense_name', trimmed);
    if (existing && existing.length > 0) {
      const ex = existing[0];
      const updatePayload: Record<string, any> = {};
      for (const m of OFFICE_FIXED_MONTH_COLS) {
        updatePayload[m] = monthlyAmounts[m] !== undefined ? Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100 : Number(ex[m] || 0);
      }
      const { data: updated, error: updErr } = await supabase
        .from('fss_outflow_oc_office_fixed')
        .update(updatePayload)
        .eq('id', ex.id)
        .select()
        .single();
      if (updErr) throw updErr;
      return (await this.loadOfficeFixedFromSupabase()).find((r: any) => r.id === ex.id) || updated;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('fss_outflow_oc_office_fixed')
      .insert(payload)
      .select()
      .single();
    if (insErr) throw insErr;
    return (await this.loadOfficeFixedFromSupabase()).find((r: any) => r.id === inserted.id) || inserted;
  },

  /**
   * Syncs / upserts Office Fixed rows.
   */
  async syncOfficeFixedToSupabase(officeFixedRows: any[]): Promise<{ officeFixed: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');

    const rows = recomputeOfficeFixedFyAndShares(officeFixedRows || []);
    const computedNames = new Set(rows.map((r: any) => String(r.expense_name || r.category || '').trim().toLowerCase()));
    const { data: existingRows, error: existingRowsError } = await supabase
      .from('fss_outflow_oc_office_fixed')
      .select('id, expense_name');
    if (existingRowsError) throw existingRowsError;
    for (const er of existingRows || []) {
      if (!computedNames.has(String(er.expense_name || '').trim().toLowerCase())) {
        const { error } = await supabase.from('fss_outflow_oc_office_fixed').delete().eq('id', er.id);
        if (error) throw error;
      }
    }

    for (const row of rows) {
      const expenseName = (row.expense_name || row.category || '').trim();
      if (!expenseName) continue;
      const payload: Record<string, any> = { expense_name: expenseName };
      for (const m of OFFICE_FIXED_MONTH_COLS) {
        if (['jan26', 'feb26', 'mar26'].includes(m)) {
          payload[m] = null;
        } else {
          const v = row[m];
          payload[m] = (v === null || v === undefined || isNaN(Number(v))) ? 0 : Math.round(Number(v) * 100) / 100;
        }
      }
      payload.fy_to_date = row.fy_to_date === null || row.fy_to_date === undefined ? officeFixedFyToDate(row) : Number(row.fy_to_date);
      payload.share = Number(row.share || 0);

      const { data: existing, error: existingError } = await supabase
        .from('fss_outflow_oc_office_fixed')
        .select('*')
        .ilike('expense_name', expenseName);
      if (existingError) throw existingError;
      if (!existing) {
        throw new Error(`Could not check for existing Office Fixed row "${expenseName}".`);
      }
      if (existing && existing.length > 0) {
        const ex = existing[0];
        payload.expense_name = ex.expense_name;
        const { data: updated, error } = await supabase
          .from('fss_outflow_oc_office_fixed')
          .update(payload)
          .eq('id', ex.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!updated) throw new Error(`Office Fixed row "${expenseName}" was not updated.`);
      } else {
        const { data: inserted, error } = await supabase
          .from('fss_outflow_oc_office_fixed')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        if (!inserted) throw new Error(`Office Fixed row "${expenseName}" was not inserted.`);
      }
    }

    const allRows = await this.loadOfficeFixedFromSupabase();
    if (rows.length > 0 && allRows.length === 0) {
      throw new Error('Office Fixed rows were synchronized but could not be reloaded from Supabase.');
    }
    return { officeFixed: allRows };
  },

  async loadOfficeVariableFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_outflow_oc_office_variable')
        .select('*')
        .order('id', { ascending: true });
      if (error) {
        console.error('Error loading fss_outflow_oc_office_variable from Supabase:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception loading fss_outflow_oc_office_variable from Supabase:', err);
      return [];
    }
  },

  async updateOfficeVariableCell(
    idOrCategory: number | string,
    monthCol: string,
    newValue: number | string
  ): Promise<{ updatedRow: any; allRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!OFFICE_FIXED_MONTH_COLS.includes(monthCol)) throw new Error(`Invalid month column: ${monthCol}`);
    const numVal = Number(newValue);
    const isJanFebMar = ['jan26', 'feb26', 'mar26'].includes(monthCol);
    const cleanVal = isJanFebMar ? null : (isNaN(numVal) || numVal < 0 ? 0 : Math.round(numVal * 100) / 100);

    let currentRow: any = null;
    const key = String(idOrCategory ?? '').trim();
    if (/^\d+$/.test(key)) {
      const { data } = await supabase.from('fss_outflow_oc_office_variable').select('*').eq('id', Number(key)).maybeSingle();
      currentRow = data;
    } else {
      const { data } = await supabase.from('fss_outflow_oc_office_variable').select('*').ilike('category', key).maybeSingle();
      currentRow = data;
    }
    if (!currentRow) throw new Error(`Record "${idOrCategory}" not found in fss_outflow_oc_office_variable.`);

    const { data: updated, error: updErr } = await supabase
      .from('fss_outflow_oc_office_variable')
      .update({ [monthCol]: cleanVal })
      .eq('id', currentRow.id)
      .select()
      .single();
    if (updErr) throw updErr;

    const allRows = await this.loadOfficeVariableFromSupabase();
    const recomputed = recomputeOfficeVariableFyAndShares(allRows);
    for (const r of recomputed) {
      const norm = (s: string) => (s || '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
      const isGroup = Boolean(r.isGroup) || norm(r.category || '').includes('total') || norm(r.category || '') === 'office variable';
      if (isGroup) {
        const payload: Record<string, any> = { fy_to_date: r.fy_to_date, share: 100 };
        for (const m of OFFICE_FIXED_MONTH_COLS) {
          payload[m] = ['jan26', 'feb26', 'mar26'].includes(m) ? null : (Number(r[m]) || 0);
        }
        await supabase.from('fss_outflow_oc_office_variable').update(payload).eq('id', r.id);
      } else {
        await supabase.from('fss_outflow_oc_office_variable').update({ fy_to_date: r.fy_to_date, share: r.share }).eq('id', r.id);
      }
    }
    const updatedRow = recomputed.find((r: any) => r.id === currentRow.id) || updated;
    return { updatedRow, allRows: await this.loadOfficeVariableFromSupabase() };
  },

  async addOfficeVariableExpense(
    categoryName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = categoryName.trim();
    if (!trimmed) throw new Error('Category name is required.');

    const payload: Record<string, any> = { category: trimmed };
    for (const m of OFFICE_FIXED_MONTH_COLS) {
      if (['jan26', 'feb26', 'mar26'].includes(m)) {
        payload[m] = null;
      } else {
        const v = monthlyAmounts[m];
        payload[m] = v !== undefined && v !== null && !isNaN(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0;
      }
    }
    payload.fy_to_date = OFFICE_FIXED_MONTH_COLS.reduce((acc, m) => {
      if (!['jan26', 'feb26', 'mar26'].includes(m)) return acc + Number(payload[m] || 0);
      return acc;
    }, 0);
    payload.share = 0;

    const { data: existing } = await supabase.from('fss_outflow_oc_office_variable').select('*').ilike('category', trimmed);
    if (existing && existing.length > 0) {
      await supabase.from('fss_outflow_oc_office_variable').update(payload).eq('id', existing[0].id);
    } else {
      await supabase.from('fss_outflow_oc_office_variable').insert(payload);
    }

    const allRows = await this.loadOfficeVariableFromSupabase();
    const recomputed = recomputeOfficeVariableFyAndShares(allRows);
    for (const r of recomputed) {
      const isGroup = Boolean(r.isGroup) || String(r.category || '').toLowerCase().includes('total');
      if (isGroup) {
        const pPayload: Record<string, any> = { fy_to_date: r.fy_to_date, share: 100 };
        for (const m of OFFICE_FIXED_MONTH_COLS) {
          pPayload[m] = ['jan26', 'feb26', 'mar26'].includes(m) ? null : (Number(r[m]) || 0);
        }
        await supabase.from('fss_outflow_oc_office_variable').update(pPayload).eq('id', r.id);
      } else {
        await supabase.from('fss_outflow_oc_office_variable').update({ fy_to_date: r.fy_to_date, share: r.share }).eq('id', r.id);
      }
    }
    return (await this.loadOfficeVariableFromSupabase()).find((r: any) => r.category === trimmed);
  },

  async syncOfficeVariableToSupabase(officeVariableRows: any[]): Promise<{ officeVariable: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const rows = recomputeOfficeVariableFyAndShares(officeVariableRows || []);
    const computedNames = new Set(rows.map((r: any) => String(r.category || r.expense_name || '').trim().toLowerCase()));
    const { data: existingRows, error: existingRowsError } = await supabase
      .from('fss_outflow_oc_office_variable')
      .select('id, category');
    if (existingRowsError) throw existingRowsError;
    for (const er of existingRows || []) {
      if (!computedNames.has(String(er.category || '').trim().toLowerCase())) {
        const { error } = await supabase.from('fss_outflow_oc_office_variable').delete().eq('id', er.id);
        if (error) throw error;
      }
    }

    for (const row of rows) {
      const categoryName = (row.category || row.expense_name || '').trim();
      if (!categoryName) continue;
      const payload: Record<string, any> = { category: categoryName };
      for (const m of OFFICE_FIXED_MONTH_COLS) {
        if (['jan26', 'feb26', 'mar26'].includes(m)) {
          payload[m] = null;
        } else {
          const v = row[m];
          payload[m] = (v === null || v === undefined || isNaN(Number(v))) ? 0 : Math.round(Number(v) * 100) / 100;
        }
      }
      payload.fy_to_date = row.fy_to_date === null || row.fy_to_date === undefined ? null : Number(row.fy_to_date);
      payload.share = Number(row.share || 0);

      const { data: existing, error: existingError } = await supabase
        .from('fss_outflow_oc_office_variable')
        .select('*')
        .ilike('category', categoryName);
      if (existingError) throw existingError;
      if (!existing) {
        throw new Error(`Could not check for existing Office Variable row "${categoryName}".`);
      }
      if (existing && existing.length > 0) {
        const ex = existing[0];
        payload.category = ex.category;
        const { data: updated, error } = await supabase
          .from('fss_outflow_oc_office_variable')
          .update(payload)
          .eq('id', ex.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!updated) throw new Error(`Office Variable row "${categoryName}" was not updated.`);
      } else {
        const { data: inserted, error } = await supabase
          .from('fss_outflow_oc_office_variable')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        if (!inserted) throw new Error(`Office Variable row "${categoryName}" was not inserted.`);
      }
    }
    const allRows = await this.loadOfficeVariableFromSupabase();
    if (rows.length > 0 && allRows.length === 0) {
      throw new Error('Office Variable rows were synchronized but could not be reloaded from Supabase.');
    }
    return { officeVariable: allRows };
  },

  async loadTravelFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from(TRAVEL_TABLE)
      .select('*')
      .order('id', { ascending: true });
    if (error) {
      console.error('Error loading fss_outflow_oc_travel from Supabase:', error);
      throw error;
    }
    return recomputeTravelFyAndShares((data || []).map(travelUiRowFromSupabase));
  },

  async syncTravelToSupabase(travelRows: any[]): Promise<{ travel: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const rows = recomputeTravelFyAndShares(travelRows || []);
    const categoryKey = (value: any) => {
      const normalized = String(value || '').trim().toLowerCase();
      return normalized.includes('total') || normalized === 'travel' ? '__travel_total' : normalized;
    };
    const { data: existingRows, error: existingError } = await supabase
      .from(TRAVEL_TABLE)
      .select('*');
    if (existingError) throw existingError;
    const existingByCategory = new Map<string, any[]>();
    for (const existing of existingRows || []) {
      const key = categoryKey(existing.category_name ?? existing.category);
      existingByCategory.set(key, [...(existingByCategory.get(key) || []), existing]);
    }
    const expectedRows = new Map<string, any>();
    const keptIds = new Set<number | string>();
    const nullableNumber = (value: any): number | null => {
      if (value === null || value === undefined || String(value).trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
    };

    for (const row of rows) {
      const categoryName = (row.category || row.category_name || '').trim();
      if (!categoryName) continue;
      const key = categoryKey(categoryName);
      const existing = existingByCategory.get(key) || [];
      const current = existing[0];
      const payload: Record<string, any> = {
        category_name: current?.category_name || current?.category || categoryName,
        fy_to_date: nullableNumber(row.fy_to_date),
        shares: nullableNumber(row.share ?? row.shares)
      };
      for (const [uiMonth, dbMonth] of Object.entries(TRAVEL_DB_MONTH_COLS)) {
        payload[dbMonth] = nullableNumber(row[uiMonth]);
      }

      if (current) {
        const { data: updated, error } = await supabase
          .from(TRAVEL_TABLE)
          .update(payload)
          .eq('id', current.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!updated) throw new Error(`Travel row "${categoryName}" was not updated.`);
        keptIds.add(updated.id);
      } else {
        const { data: inserted, error } = await supabase
          .from(TRAVEL_TABLE)
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        if (!inserted) throw new Error(`Travel row "${categoryName}" was not inserted.`);
        keptIds.add(inserted.id);
      }
      expectedRows.set(key, { ...row, category: categoryName });
    }

    // The UI treats sync as the source-of-truth reconciliation. Remove rows
    // that no longer exist in the UI, including duplicate stale rows.
    for (const existing of existingRows || []) {
      if (!keptIds.has(existing.id)) {
        const { error } = await supabase
          .from(TRAVEL_TABLE)
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
      }
    }

    const allRows = await this.loadTravelFromSupabase();
    const loadedByCategory = new Map(allRows.map((row: any) => [categoryKey(row.category), row]));
    for (const [key, expected] of expectedRows) {
      const loaded = loadedByCategory.get(key);
      if (!loaded) throw new Error(`Travel row "${expected.category}" was not reloaded from Supabase.`);
      for (const month of OFFICE_FIXED_MONTH_COLS) {
        const expectedValue = expected[month] == null ? null : Number(expected[month]);
        const loadedValue = loaded[month] == null ? null : Number(loaded[month]);
        if (expectedValue === null ? loadedValue !== null : Math.round((loadedValue || 0) * 100) !== Math.round(expectedValue * 100)) {
          throw new Error(`Travel row "${expected.category}" does not match Supabase for ${month}.`);
        }
      }
    }
    return { travel: allRows };
  },

  async updateTravelCell(
    idOrCategory: number | string,
    monthCol: string,
    newValue: number | string | null
  ): Promise<{ updatedRow: any; allRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const validMonthCols = OFFICE_FIXED_MONTH_COLS;
    const cleanCol = (monthCol || '').toLowerCase().trim();
    if (!validMonthCols.includes(cleanCol)) {
      throw new Error(`Invalid month column: ${monthCol}`);
    }

    const rawValue = newValue === null || newValue === undefined ? '' : String(newValue).trim();
    const numVal = Number(rawValue);
    const cleanVal = rawValue === '' || !Number.isFinite(numVal) || numVal < 0
      ? null
      : Math.round(numVal * 100) / 100;

    const categoryKey = String(idOrCategory ?? '').trim();
    const isNumeric = /^\d+$/.test(categoryKey);
    let currentRow: any = null;
    if (isNumeric) {
    const { data, error } = await supabase.from(TRAVEL_TABLE).select('*').eq('id', categoryKey).maybeSingle();
      if (error) throw error;
      if (data) currentRow = data;
    }
    if (!currentRow) {
      const { data, error } = await supabase.from(TRAVEL_TABLE).select('*').ilike('category_name', categoryKey).maybeSingle();
      if (error) throw error;
      if (data) currentRow = data;
    }
    if (!currentRow) {
      throw new Error(`Record "${idOrCategory}" not found in fss_outflow_oc_travel.`);
    }

    const dbMonth = TRAVEL_DB_MONTH_COLS[cleanCol];
    const { error: updErr } = await supabase
      .from(TRAVEL_TABLE)
      .update({ [dbMonth]: cleanVal })
      .eq('id', currentRow.id);
    if (updErr) throw updErr;

    const { data: allRaw, error: loadError } = await supabase
      .from(TRAVEL_TABLE)
      .select('*')
      .order('id', { ascending: true });
    if (loadError) throw loadError;
    const synced = await this.syncTravelToSupabase((allRaw || []).map(travelUiRowFromSupabase));
    const updatedRow = synced.travel.find((row: any) => row.id === currentRow.id);
    if (!updatedRow) throw new Error(`Updated Travel row "${currentRow.category}" could not be reloaded.`);
    return { updatedRow, allRows: synced.travel };
  },

  async addTravelExpense(
    categoryName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = (categoryName || '').trim();
    if (!trimmed) throw new Error('Category name is required.');
    if (trimmed.toLowerCase().includes('total') || trimmed.toLowerCase() === 'travel') {
      throw new Error('Cannot add a record named "Total" or "Travel".');
    }

    const normalize = (value: any) => String(value || '').trim().toLowerCase();
    const existingRows = await this.loadTravelFromSupabase();
    const loadError = null;
    if (loadError) throw loadError;
    const allRows = existingRows || [];
    const existing = allRows.find((row: any) => normalize(row.category) === normalize(trimmed));
    const nextRow: Record<string, any> = { ...(existing || {}), category: existing?.category || trimmed };
    for (const month of OFFICE_FIXED_MONTH_COLS) {
      if (monthlyAmounts[month] !== undefined) {
        const value = monthlyAmounts[month];
        const numeric = value === null || value === undefined || String(value).trim() === '' ? NaN : Number(value);
        nextRow[month] = Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
      } else if (existing) {
        nextRow[month] = existing[month];
      } else {
        nextRow[month] = null;
      }
    }

    const nextRows = existing
      ? allRows.map((row: any) => row.id === existing.id ? nextRow : row)
      : [...allRows, nextRow];
    const synced = await this.syncTravelToSupabase(nextRows);
    return synced.travel.find((row: any) => normalize(row.category) === normalize(trimmed));
  },

  async loadProfessionalAdminFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('fss_outflow_oc_professional_admin')
      .select('*')
      .order('id', { ascending: true });
    if (error) {
      console.error('Error loading fss_outflow_oc_professional_admin from Supabase:', error);
      throw error;
    }
    return recomputeProfessionalAdminFyAndShares(data || []);
  },

  async syncProfessionalAdminToSupabase(rows: any[]): Promise<{ professionalAdmin: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const computed = recomputeProfessionalAdminFyAndShares(rows || []);
    const categoryKey = (value: any) => {
      const normalized = String(value || '').trim().toLowerCase();
      return normalized.includes('total') || normalized === 'professional & admin'
        ? '__professional_admin_total'
        : normalized;
    };
    const { data: existingRows, error: existingError } = await supabase
      .from('fss_outflow_oc_professional_admin')
      .select('*');
    if (existingError) throw existingError;
    const existingByCategory = new Map<string, any[]>();
    for (const existing of existingRows || []) {
      const key = categoryKey(existing.category);
      existingByCategory.set(key, [...(existingByCategory.get(key) || []), existing]);
    }
    const expectedRows = new Map<string, any>();
    const keptIds = new Set<number | string>();
    const nullableNumber = (value: any): number | null => {
      if (value === null || value === undefined || String(value).trim() === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
    };

    for (const row of computed) {
      const categoryName = (row.category || '').trim();
      if (!categoryName) continue;
      const key = categoryKey(categoryName);
      const current = (existingByCategory.get(key) || [])[0];
      const payload: Record<string, any> = { category: current?.category || categoryName };
      for (const m of OFFICE_FIXED_MONTH_COLS) {
        payload[m] = nullableNumber(row[m]);
      }
      payload.fy_to_date = nullableNumber(row.fy_to_date);
      payload.share = nullableNumber(row.share);

      if (current) {
        const { data: updated, error } = await supabase
          .from('fss_outflow_oc_professional_admin')
          .update(payload)
          .eq('id', current.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!updated) throw new Error(`Professional & Admin row "${categoryName}" was not updated.`);
        keptIds.add(updated.id);
      } else {
        const { data: inserted, error } = await supabase
          .from('fss_outflow_oc_professional_admin')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        if (!inserted) throw new Error(`Professional & Admin row "${categoryName}" was not inserted.`);
        keptIds.add(inserted.id);
      }
      expectedRows.set(key, { ...(current || {}), ...payload });
    }

    // Remove Supabase rows that the UI no longer contains. This makes delete
    // operations durable instead of allowing stale rows to return on reload.
    for (const existing of existingRows || []) {
      if (!keptIds.has(existing.id)) {
        const { error } = await supabase
          .from('fss_outflow_oc_professional_admin')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
      }
    }

    const allRows = await this.loadProfessionalAdminFromSupabase();
    const loadedByCategory = new Map(allRows.map((row: any) => [categoryKey(row.category), row]));
    for (const [key, expected] of expectedRows) {
      const loaded = loadedByCategory.get(key);
      if (!loaded) throw new Error(`Professional & Admin row "${expected.category}" was not reloaded from Supabase.`);
      for (const month of OFFICE_FIXED_MONTH_COLS) {
        const expectedValue = expected[month] == null ? null : Number(expected[month]);
        const loadedValue = loaded[month] == null ? null : Number(loaded[month]);
        if (expectedValue === null ? loadedValue !== null : Math.round((loadedValue || 0) * 100) !== Math.round(expectedValue * 100)) {
          throw new Error(`Professional & Admin row "${expected.category}" does not match Supabase for ${month}.`);
        }
      }
    }
    return { professionalAdmin: allRows };
  },

  async updateProfessionalAdminCell(
    idOrCategory: number | string,
    monthCol: string,
    newValue: number | string
  ): Promise<{ updatedRow: any; allRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const validMonthCols = OFFICE_FIXED_MONTH_COLS;
    const cleanCol = (monthCol || '').toLowerCase().trim();
    if (!validMonthCols.includes(cleanCol)) {
      throw new Error(`Invalid month column: ${monthCol}`);
    }

    const rawValue = String(newValue ?? '').trim();
    const numVal = Number(rawValue);
    const cleanVal = rawValue === '' || isNaN(numVal) || numVal < 0
      ? null
      : Math.round(numVal * 100) / 100;

    const categoryKey = String(idOrCategory ?? '').trim();
    const isNumeric = /^\d+$/.test(categoryKey);
    let currentRow: any = null;
    if (isNumeric) {
      const { data, error } = await supabase.from('fss_outflow_oc_professional_admin').select('*').eq('id', Number(categoryKey)).maybeSingle();
      if (error) throw error;
      if (data) currentRow = data;
    }
    if (!currentRow) {
      const { data, error } = await supabase.from('fss_outflow_oc_professional_admin').select('*').ilike('category', categoryKey).maybeSingle();
      if (error) throw error;
      if (data) currentRow = data;
    }
    if (!currentRow) {
      throw new Error(`Record "${idOrCategory}" not found in fss_outflow_oc_professional_admin.`);
    }

    const { error: updErr } = await supabase
      .from('fss_outflow_oc_professional_admin')
      .update({ [cleanCol]: cleanVal })
      .eq('id', currentRow.id);
    if (updErr) throw updErr;

    const { data: allRaw, error: loadError } = await supabase
      .from('fss_outflow_oc_professional_admin')
      .select('*')
      .order('id', { ascending: true });
    if (loadError) throw loadError;
    const synced = await this.syncProfessionalAdminToSupabase(allRaw || []);
    const updatedComputed = synced.professionalAdmin.find((row: any) => row.id === currentRow.id);
    if (!updatedComputed) throw new Error(`Updated Professional & Admin row "${currentRow.category}" could not be reloaded.`);
    return { updatedRow: updatedComputed, allRows: synced.professionalAdmin };
  },

  async addProfessionalAdminExpense(
    categoryName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = (categoryName || '').trim();
    if (!trimmed) throw new Error('Category name is required.');
    if (trimmed.toLowerCase().includes('total') || trimmed.toLowerCase() === 'professional & admin') {
      throw new Error('Cannot add a record named "Total" or "Professional & Admin".');
    }

    const normalize = (value: any) => String(value || '').trim().toLowerCase();
    const { data: existingRows, error: loadError } = await supabase
      .from('fss_outflow_oc_professional_admin')
      .select('*');
    if (loadError) throw loadError;
    const allRows = existingRows || [];
    const existing = allRows.find((row: any) => normalize(row.category) === normalize(trimmed));
    const nextRow: Record<string, any> = { ...(existing || {}), category: existing?.category || trimmed };
    for (const month of OFFICE_FIXED_MONTH_COLS) {
      if (monthlyAmounts[month] !== undefined) {
        const value = monthlyAmounts[month];
        const numeric = value === null || value === undefined || String(value).trim() === '' ? NaN : Number(value);
        nextRow[month] = Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
      } else if (existing) {
        nextRow[month] = existing[month];
      } else {
        nextRow[month] = null;
      }
    }

    const nextRows = existing
      ? allRows.map((row: any) => row.id === existing.id ? nextRow : row)
      : [...allRows, nextRow];
    const synced = await this.syncProfessionalAdminToSupabase(nextRows);
    return synced.professionalAdmin.find((row: any) => normalize(row.category) === normalize(trimmed));
  },

  /**
   * Generic delete for any outflow table row by primary key (id) or, when no numeric id,
   * by the provided name/category column.
   */
  async deleteOutflowRecord(tableName: string, idOrKey: any, nameColumn?: string): Promise<boolean> {
    if (!supabase || !tableName || idOrKey == null) return false;
    // Allow passing a row object
    if (typeof idOrKey === 'object') {
      idOrKey = idOrKey.id ?? idOrKey.category ?? idOrKey.category_name ?? idOrKey.expense_name ?? idOrKey.name ?? idOrKey.receipt_name ?? idOrKey.income_name ?? idOrKey.financing_name;
    }
    if (idOrKey == null) return false;
    try {
      const key = String(idOrKey).trim();
      const isNumeric = /^\d+$/.test(key);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);

      let deletedRows: any[] = [];
      if (isNumeric || isUuid) {
        const { data, error } = await supabase.from(tableName).delete().eq('id', isNumeric ? Number(key) : key).select();
        if (error) {
          console.error(`Error deleting from ${tableName} by id:`, error.message);
          return false;
        }
        deletedRows = data || [];
      } else if (nameColumn) {
        const { data, error } = await supabase.from(tableName).delete().ilike(nameColumn, key).select();
        if (error) {
          console.error(`Error deleting from ${tableName} by ${nameColumn}:`, error.message);
          return false;
        }
        deletedRows = data || [];
      } else {
        for (const col of ['category', 'expense_name', 'receipt_name', 'income_name', 'financing_name']) {
          const { data, error } = await supabase.from(tableName).delete().ilike(col, key).select();
          if (!error && data && data.length > 0) {
            deletedRows = data;
            break;
          }
        }
      }
      if (!deletedRows || deletedRows.length === 0) {
        console.warn(`No matching record found in ${tableName} for key:`, key);
        return false;
      }
      return true;
    } catch (err) {
      console.error(`Exception deleting from ${tableName}:`, err);
      return false;
    }
  },

  // People outflow
  async deletePeople(idOrKey: any): Promise<boolean> {
    return this.deleteOutflowRecord('fss_outflow_oc_people', idOrKey, 'category');
  },
  async deletePeopleExpense(idOrKey: any): Promise<boolean> {
    return this.deletePeople(idOrKey);
  },
  async deletePeopleFromSupabase(idOrKey: any): Promise<boolean> {
    return this.deletePeople(idOrKey);
  },
  async deletePeopleRow(idOrKey: any): Promise<boolean> {
    return this.deletePeople(idOrKey);
  },

  // Project cost outflow
  async deleteProjectCost(idOrKey: any, monthCol?: string): Promise<boolean> {
    // Per-month delete: zero out ONLY the selected month column; the rest of the record is kept.
    if (monthCol) {
      const cleanMonth = String(monthCol || '').toLowerCase().trim();
      const validMonthCols = PROJECT_COST_MONTH_COLS;
      if (!validMonthCols.includes(cleanMonth)) return false;
      const categoryKey = String(idOrKey ?? '').trim();
      const { data: currentRow, error: selErr } = await supabase
        .from('fss_outflow_project_cost')
        .select('*')
        .ilike('category', categoryKey)
        .maybeSingle();
      if (selErr || !currentRow) {
        console.warn(`No matching record found in fss_outflow_project_cost for key:`, categoryKey);
        return false;
      }
      const isJanFebMar = ['jan_26', 'feb_26', 'mar_26'].includes(cleanMonth);
      const { error: updErr } = await supabase
        .from('fss_outflow_project_cost')
        .update({ [cleanMonth]: isJanFebMar ? null : 0 })
        .eq('category', currentRow.category);
      if (updErr) {
        console.error('Error zeroing fss_outflow_project_cost month column:', updErr);
        return false;
      }
      const { data: allRaw } = await supabase.from('fss_outflow_project_cost').select('*');
      const recomputed = recomputeProjectCostFyAndShares(allRaw || []);
      const parentRow = recomputed.find((r: any) => String(r.category || '').toLowerCase() === 'project costs');
      if (parentRow) {
        const parentPayload: Record<string, any> = {
          fy_to_date: parentRow.fy_to_date,
          shares: parentRow.shares
        };
        for (const m of PROJECT_COST_MONTH_COLS) {
          parentPayload[m] = parentRow[m] !== undefined ? parentRow[m] : null;
        }
        await supabase.from('fss_outflow_project_cost').update(parentPayload).eq('category', parentRow.category);
      }
      return true;
    }
    const ok = await this.deleteOutflowRecord('fss_outflow_project_cost', idOrKey, 'category');
    if (ok && supabase) {
      const { data: allRaw } = await supabase.from('fss_outflow_project_cost').select('*');
      const recomputed = recomputeProjectCostFyAndShares(allRaw || []);
      const parentRow = recomputed.find((r: any) => String(r.category || '').toLowerCase() === 'project costs');
      if (parentRow) {
        const parentPayload: Record<string, any> = {
          fy_to_date: parentRow.fy_to_date,
          shares: parentRow.shares
        };
        for (const m of PROJECT_COST_MONTH_COLS) {
          parentPayload[m] = parentRow[m] !== undefined ? parentRow[m] : null;
        }
        await supabase.from('fss_outflow_project_cost').update(parentPayload).eq('category', parentRow.category);
      }
    }
    return ok;
  },
  async deleteProjectCost2(idOrKey: any, monthCol?: string): Promise<boolean> {
    if (!supabase) return false;
    const rawKey = String(idOrKey ?? '').trim();
    const category = rawKey.toLowerCase() === 'project costs' ? 'Project Costs Total' : rawKey;
    if (monthCol) {
      const month = String(monthCol).trim().toLowerCase();
      if (!PROJECT_COST_MONTH_COLS.includes(month)) return false;
      const { error } = await supabase.from('fss_outflow_project_cost_2')
        .update({ [month]: 0 }).ilike('category', category);
      if (error) {
        console.error('Error clearing Project Costs 2 month:', error);
        return false;
      }
      return true;
    }
    const { error } = await supabase.from('fss_outflow_project_cost_2').delete().ilike('category', category);
    if (error) {
      console.error('Error deleting Project Costs 2 row:', error);
      return false;
    }
    return true;
  },
  async deleteProjectCostExpense(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteProjectCost(idOrKey, monthCol);
  },
  async deleteProjectCostFromSupabase(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteProjectCost(idOrKey, monthCol);
  },
  async deleteProjectCostRow(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteProjectCost(idOrKey, monthCol);
  },

  // Capex outflow
  async deleteCapex(idOrKey: any): Promise<boolean> {
    if (!supabase || idOrKey == null) return false;
    const category = typeof idOrKey === 'object'
      ? String(idOrKey.category ?? idOrKey.category_name ?? idOrKey.name ?? '').trim()
      : String(idOrKey).trim();
    if (!category) return false;
    const { data, error } = await supabase
      .from('fss_outflow_capex')
      .delete()
      .ilike('category', category)
      .select('category');
    if (error) {
      console.error('Error deleting Capex row by category:', error);
      return false;
    }
    return Boolean(data?.length);
  },
  async deleteCapex2(idOrKey: any): Promise<boolean> {
    return this.deleteOutflowRecord('fss_outflow_capex_2', idOrKey, 'category');
  },
  async deleteCapexExpense(idOrKey: any): Promise<boolean> {
    return this.deleteCapex(idOrKey);
  },
  async deleteCapexFromSupabase(idOrKey: any): Promise<boolean> {
    return this.deleteCapex(idOrKey);
  },
  async deleteCapexRow(idOrKey: any): Promise<boolean> {
    return this.deleteCapex(idOrKey);
  },

  // Financing & owner outflow
  async deleteFinancingAndOwner(idOrKey: any): Promise<boolean> {
    return this.deleteOutflowRecord('fss_outflow_financing_and_owner', idOrKey, 'category');
  },
  async deleteFinancingAndOwnerExpense(idOrKey: any): Promise<boolean> {
    return this.deleteFinancingAndOwner(idOrKey);
  },
  async deleteFinancingAndOwnerFromSupabase(idOrKey: any): Promise<boolean> {
    return this.deleteFinancingAndOwner(idOrKey);
  },
  async deleteFinancingAndOwnerRow(idOrKey: any): Promise<boolean> {
    return this.deleteFinancingAndOwner(idOrKey);
  },

  // Office fixed outflow
  async deleteOfficeFixed(idOrKey: any, monthCol?: string): Promise<boolean> {
    if (!supabase) return false;
    if (monthCol) {
      const cleanMonth = String(monthCol || '').toLowerCase().trim();
      const validMonthCols = OFFICE_FIXED_MONTH_COLS;
      if (!validMonthCols.includes(cleanMonth)) return false;
      const key = String(idOrKey ?? '').trim();
      const isNumeric = /^\d+$/.test(key);
      let currentRow: any = null;
      if (isNumeric) {
        const { data } = await supabase.from('fss_outflow_oc_office_fixed').select('*').eq('id', Number(key)).maybeSingle();
        currentRow = data;
      }
      if (!currentRow) {
        const { data } = await supabase.from('fss_outflow_oc_office_fixed').select('*').ilike('expense_name', key).maybeSingle();
        currentRow = data;
      }
      if (!currentRow) return false;
      const isJanFebMar = ['jan26', 'feb26', 'mar26'].includes(cleanMonth);
      const { error: updErr } = await supabase
        .from('fss_outflow_oc_office_fixed')
        .update({ [cleanMonth]: isJanFebMar ? null : 0 })
        .eq('id', currentRow.id);
      if (updErr) return false;
      const allRows = await this.loadOfficeFixedFromSupabase();
      const recomputed = recomputeOfficeFixedFyAndShares(allRows);
      const parentRow = recomputed.find((r: any) => String(r.expense_name || r.category || '').toLowerCase().includes('total') || String(r.expense_name || r.category || '').toLowerCase().includes('fixed'));
      if (parentRow) {
        const parentPayload: Record<string, any> = {
          fy_to_date: parentRow.fy_to_date,
          share: parentRow.share
        };
        for (const m of OFFICE_FIXED_MONTH_COLS) {
          if (['jan26', 'feb26', 'mar26'].includes(m)) {
            parentPayload[m] = null;
          } else {
            const sum = recomputed.filter((child: any) => child.id !== parentRow.id).reduce((s: number, child: any) => s + Number(child[m] || 0), 0);
            parentPayload[m] = Math.round(sum * 100) / 100;
          }
        }
        await supabase.from('fss_outflow_oc_office_fixed').update(parentPayload).eq('id', parentRow.id);
      }
      return true;
    }
    const ok = await this.deleteOutflowRecord('fss_outflow_oc_office_fixed', idOrKey, 'expense_name');
    if (ok) {
      try {
        const allRows = await this.loadOfficeFixedFromSupabase();
        const recomputed = recomputeOfficeFixedFyAndShares(allRows);
        const parentRow = recomputed.find((r: any) => String(r.expense_name || r.category || '').toLowerCase().includes('total') || String(r.expense_name || r.category || '').toLowerCase().includes('fixed'));
        if (parentRow) {
          const parentPayload: Record<string, any> = {
            fy_to_date: parentRow.fy_to_date,
            share: parentRow.share
          };
          for (const m of OFFICE_FIXED_MONTH_COLS) {
            if (['jan26', 'feb26', 'mar26'].includes(m)) {
              parentPayload[m] = null;
            } else {
              const sum = recomputed.filter((child: any) => child.id !== parentRow.id).reduce((s: number, child: any) => s + Number(child[m] || 0), 0);
              parentPayload[m] = Math.round(sum * 100) / 100;
            }
          }
          await supabase.from('fss_outflow_oc_office_fixed').update(parentPayload).eq('id', parentRow.id);
        }
      } catch (e) {
        console.warn('Failed to recompute office fixed totals after delete:', e);
      }
    }
    return ok;
  },
  async deleteOfficeFixedExpense(idOrKey: any): Promise<boolean> {
    return this.deleteOfficeFixed(idOrKey);
  },
  async deleteOfficeFixedFromSupabase(idOrKey: any): Promise<boolean> {
    return this.deleteOfficeFixed(idOrKey);
  },
  async deleteOfficeFixedRow(idOrKey: any): Promise<boolean> {
    return this.deleteOfficeFixed(idOrKey);
  },

  // Office variable outflow
  async deleteOfficeVariable(idOrKey: any, monthCol?: string): Promise<boolean> {
    if (monthCol) {
      const cleanMonth = String(monthCol || '').toLowerCase().trim();
      const validMonthCols = OFFICE_FIXED_MONTH_COLS;
      if (!validMonthCols.includes(cleanMonth)) return false;
      const categoryKey = String(idOrKey ?? '').trim();
      const isNumeric = /^\d+$/.test(categoryKey);
      let currentRow: any = null;
      if (isNumeric) {
        const { data, error } = await supabase.from('fss_outflow_oc_office_variable').select('*').eq('id', Number(categoryKey)).maybeSingle();
        if (!error && data) currentRow = data;
      }
      if (!currentRow) {
        const { data, error } = await supabase.from('fss_outflow_oc_office_variable').select('*').ilike('category', categoryKey).maybeSingle();
        if (!error && data) currentRow = data;
      }
      if (!currentRow) {
        console.warn('No matching record found in fss_outflow_oc_office_variable for key:', categoryKey);
        return false;
      }
      const isJanFebMar = ['jan26', 'feb26', 'mar26'].includes(cleanMonth);
      const { error: updErr } = await supabase
        .from('fss_outflow_oc_office_variable')
        .update({ [cleanMonth]: isJanFebMar ? null : 0 })
        .eq('id', currentRow.id);
      if (updErr) {
        console.error('Error zeroing fss_outflow_oc_office_variable month column:', updErr);
        return false;
      }
      const { data: allRaw } = await supabase.from('fss_outflow_oc_office_variable').select('*');
      const recomputed = recomputeOfficeVariableFyAndShares(allRaw || []);
      const parentRow = recomputed.find((r: any) => String(r.category || '').toLowerCase().includes('total') || String(r.category || '').toLowerCase() === 'office variable');
      if (parentRow) {
        const parentPayload: Record<string, any> = {
          fy_to_date: parentRow.fy_to_date,
          share: parentRow.share
        };
        for (const m of OFFICE_FIXED_MONTH_COLS) {
          const isJFM = ['jan26', 'feb26', 'mar26'].includes(m);
          parentPayload[m] = isJFM ? null : Math.round(Number(parentRow[m] || 0) * 100) / 100;
        }
        await supabase.from('fss_outflow_oc_office_variable').update(parentPayload).eq('id', parentRow.id);
      }
      return true;
    }
    const ok = await this.deleteOutflowRecord('fss_outflow_oc_office_variable', idOrKey, 'category');
    if (ok && supabase) {
      const { data: allRaw } = await supabase.from('fss_outflow_oc_office_variable').select('*');
      const recomputed = recomputeOfficeVariableFyAndShares(allRaw || []);
      const parentRow = recomputed.find((r: any) => String(r.category || '').toLowerCase().includes('total') || String(r.category || '').toLowerCase() === 'office variable');
      if (parentRow) {
        const payload: Record<string, any> = {
          fy_to_date: parentRow.fy_to_date,
          share: parentRow.share
        };
        for (const m of OFFICE_FIXED_MONTH_COLS) {
          const isJFM = ['jan26', 'feb26', 'mar26'].includes(m);
          payload[m] = isJFM ? null : Math.round(Number(parentRow[m] || 0) * 100) / 100;
        }
        await supabase.from('fss_outflow_oc_office_variable').update(payload).eq('id', parentRow.id);
      }
    }
    return ok;
  },
  async deleteOfficeVariableExpense(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteOfficeVariable(idOrKey, monthCol);
  },
  async deleteOfficeVariableFromSupabase(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteOfficeVariable(idOrKey, monthCol);
  },
  async deleteOfficeVariableRow(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteOfficeVariable(idOrKey, monthCol);
  },

  // Travel outflow
  async deleteTravel(idOrKey: any, monthCol?: string): Promise<boolean> {
    if (!supabase) throw new Error('Supabase is not configured.');
    if (monthCol) {
      const cleanMonth = String(monthCol || '').toLowerCase().trim();
      if (!OFFICE_FIXED_MONTH_COLS.includes(cleanMonth)) {
        throw new Error(`Invalid month column: ${monthCol}`);
      }
      const categoryKey = String(idOrKey ?? '').trim();
      const isNumeric = /^\d+$/.test(categoryKey);
      let currentRow: any = null;
      if (isNumeric) {
        const { data, error } = await supabase.from(TRAVEL_TABLE).select('*').eq('id', categoryKey).maybeSingle();
        if (error) throw error;
        if (data) currentRow = data;
      }
      if (!currentRow) {
        const { data, error } = await supabase.from(TRAVEL_TABLE).select('*').ilike('category_name', categoryKey).maybeSingle();
        if (error) throw error;
        if (data) currentRow = data;
      }
      if (!currentRow) {
        throw new Error(`Travel row "${categoryKey}" was not found.`);
      }
      const { error: updErr } = await supabase
        .from(TRAVEL_TABLE)
         .update({ [TRAVEL_DB_MONTH_COLS[cleanMonth]]: null })
        .eq('id', currentRow.id);
      if (updErr) throw updErr;

      const { data: allRaw, error: loadError } = await supabase.from(TRAVEL_TABLE).select('*');
      if (loadError) throw loadError;
      await this.syncTravelToSupabase((allRaw || []).map(travelUiRowFromSupabase));
      return true;
    }

    const ok = await this.deleteOutflowRecord(TRAVEL_TABLE, idOrKey, 'category_name');
    if (!ok) return false;
    const { data: allRaw, error: loadError } = await supabase.from(TRAVEL_TABLE).select('*');
    if (loadError) throw loadError;
    await this.syncTravelToSupabase((allRaw || []).map(travelUiRowFromSupabase));
    return ok;
  },
  async deleteTravelExpense(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteTravel(idOrKey, monthCol);
  },
  async deleteTravelFromSupabase(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteTravel(idOrKey, monthCol);
  },
  async deleteTravelRow(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteTravel(idOrKey, monthCol);
  },

  // Professional admin outflow
  async deleteProfessionalAdmin(idOrKey: any, monthCol?: string): Promise<boolean> {
    if (!supabase) throw new Error('Supabase is not configured.');
    if (monthCol) {
      const cleanMonth = String(monthCol || '').toLowerCase().trim();
      if (!OFFICE_FIXED_MONTH_COLS.includes(cleanMonth)) {
        throw new Error(`Invalid month column: ${monthCol}`);
      }
      const categoryKey = String(idOrKey ?? '').trim();
      const isNumeric = /^\d+$/.test(categoryKey);
      let currentRow: any = null;
      if (isNumeric) {
        const { data, error } = await supabase.from('fss_outflow_oc_professional_admin').select('*').eq('id', Number(categoryKey)).maybeSingle();
        if (error) throw error;
        if (data) currentRow = data;
      }
      if (!currentRow) {
        const { data, error } = await supabase.from('fss_outflow_oc_professional_admin').select('*').ilike('category', categoryKey).maybeSingle();
        if (error) throw error;
        if (data) currentRow = data;
      }
      if (!currentRow) {
        throw new Error(`Professional & Admin row "${categoryKey}" was not found.`);
      }
      const { error: updErr } = await supabase
        .from('fss_outflow_oc_professional_admin')
        .update({ [cleanMonth]: null })
        .eq('id', currentRow.id);
      if (updErr) throw updErr;
      const { data: allRaw, error: loadError } = await supabase.from('fss_outflow_oc_professional_admin').select('*');
      if (loadError) throw loadError;
      await this.syncProfessionalAdminToSupabase(allRaw || []);
      return true;
    }

    const ok = await this.deleteOutflowRecord('fss_outflow_oc_professional_admin', idOrKey, 'category');
    if (!ok) return false;
    const { data: allRaw, error: loadError } = await supabase.from('fss_outflow_oc_professional_admin').select('*');
    if (loadError) throw loadError;
    await this.syncProfessionalAdminToSupabase(allRaw || []);
    return ok;
  },
  async deleteProfessionalAdminExpense(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteProfessionalAdmin(idOrKey, monthCol);
  },
  async deleteProfessionalAdminFromSupabase(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteProfessionalAdmin(idOrKey, monthCol);
  },
  async deleteProfessionalAdminRow(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteProfessionalAdmin(idOrKey, monthCol);
  },

  // Operation cost outflow (table may exist in Supabase)
  async syncOperationCostToSupabase(rows: any[]): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured.');

    const tableName = 'fss_cash_outflow';
    const monthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];
    const { error: schemaError } = await supabase
      .from(tableName)
      .select(`category_name,sort_order,${monthCols.join(',')},fy_to_date,shares`)
      .limit(0);
    if (schemaError) {
      console.error(`Unable to resolve ${tableName} columns:`, schemaError);
      throw schemaError;
    }

    const desiredRows = (rows || []).filter((row: any) => String(row.category_name || '').trim());
    const desiredNames = new Set(desiredRows.map((row: any) => String(row.category_name).trim().toLowerCase()));
    const { data: existingRows, error: loadError } = await supabase.from(tableName).select('*');
    if (loadError) throw loadError;

    const retainedNames = new Set<string>();
    for (const existing of existingRows || []) {
      const name = String(existing.category_name || '').trim().toLowerCase();
      if (!desiredNames.has(name) || retainedNames.has(name)) {
        const { error } = await supabase.from(tableName).delete().eq('id', existing.id);
        if (error) throw error;
      } else {
        retainedNames.add(name);
      }
    }

    for (const row of desiredRows) {
      const categoryName = String(row.category_name).trim();
      const existing = (existingRows || []).find((item: any) =>
        String(item.category_name || '').trim().toLowerCase() === categoryName.toLowerCase()
      );
      const payload: Record<string, any> = {
        category_name: categoryName,
        sort_order: Number(row.sort_order || 0),
        fy_to_date: row.fy_to_date === null || row.fy_to_date === undefined || row.fy_to_date === ''
          ? null
          : Math.round(Number(row.fy_to_date) * 100) / 100,
        shares: Number(row.shares || 0)
      };
      for (const month of monthCols) {
        const value = row[month];
        payload[month] = value === null || value === undefined || value === ''
          ? null
          : Math.round(Number(value) * 100) / 100;
      }

      const result = existing
        ? await supabase.from(tableName).update(payload).eq('id', existing.id)
        : await supabase.from(tableName).insert(payload);
      if (result.error) {
        console.error(`Error saving ${categoryName} to ${tableName}:`, result.error);
        throw result.error;
      }
    }

    const { data, error } = await supabase.from(tableName).select('*').order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async syncCashflowStatementToSupabase(rows: any[]): Promise<any[]> {
    if (!supabase) throw new Error('Supabase is not configured.');

    const tableName = 'fss_cash_flow_statement';
    const monthCols = [
      'jan_26', 'feb_26', 'mar_26', 'apr_26', 'may_26', 'jun_26',
      'jul_26', 'aug_26', 'sep_26', 'oct_26', 'nov_26', 'dec_26'
    ];
    const categories = ['Opening Balance', 'Cash Inflow', 'Cash Outflow', 'Net Cash Flow', 'Closing Balance'];
    const { error: schemaError } = await supabase
      .from(tableName)
      .select(`category_name,sort_order,${monthCols.join(',')},fy_to_date,shares`)
      .limit(0);
    if (schemaError) {
      console.error(`Unable to resolve ${tableName} columns:`, schemaError);
      throw schemaError;
    }

    const rowsByName = new Map(
      (rows || []).map((row: any) => [String(row.category_name || '').trim().toLowerCase(), row])
    );
    const { data: existingRows, error: loadError } = await supabase.from(tableName).select('*');
    if (loadError) throw loadError;

    for (const [sortOrder, categoryName] of categories.entries()) {
      const row = rowsByName.get(categoryName.toLowerCase());
      if (!row) {
        throw new Error(`Missing "${categoryName}" in the cashflow statement UI; Supabase was not changed.`);
      }

      const numericValue = (value: any, field: string): number | null => {
        if (value === null || value === undefined || value === '') return null;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          throw new Error(`Invalid ${field} for "${categoryName}"; Supabase was not changed.`);
        }
        return Math.round(numeric * 100) / 100;
      };
      const payload: Record<string, any> = {
        category_name: categoryName,
        sort_order: sortOrder,
        fy_to_date: numericValue(row.fy_to_date, 'FY-to-date value'),
        shares: numericValue(row.shares, 'share')
      };
      for (const month of monthCols) {
        payload[month] = numericValue(row[month], month);
      }

      const matches = (existingRows || []).filter((item: any) =>
        String(item.category_name || '').trim().toLowerCase() === categoryName.toLowerCase()
      );
      if (matches.length) {
        const { error } = await supabase.from(tableName).update(payload).eq('id', matches[0].id);
        if (error) {
          console.error(`Error saving ${categoryName} to ${tableName}:`, error);
          throw error;
        }
        for (const duplicate of matches.slice(1)) {
          const { error: deleteError } = await supabase.from(tableName).delete().eq('id', duplicate.id);
          if (deleteError) throw deleteError;
        }
      } else {
        const { error } = await supabase.from(tableName).insert(payload);
        if (error) {
          console.error(`Error saving ${categoryName} to ${tableName}:`, error);
          throw error;
        }
      }
    }

    const { data, error } = await supabase.from(tableName).select('*').order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async deleteOperationCost(idOrKey: any): Promise<boolean> {
    return this.deleteOutflowRecord('fss_cash_outflow', idOrKey, 'category_name');
  },
  async deleteOperationCostExpense(idOrKey: any): Promise<boolean> {
    return this.deleteOperationCost(idOrKey);
  },
  async deleteOperationCostFromSupabase(idOrKey: any): Promise<boolean> {
    return this.deleteOperationCost(idOrKey);
  },
  async deleteOperationCostRow(idOrKey: any): Promise<boolean> {
    return this.deleteOperationCost(idOrKey);
  },

  // Tax statutory outflow (public.fss_outflow_tax_statutory)
  isTaxStatutoryDirty(rawRows: any[], recomputedRows: any[]): boolean {
    const norm = (s: string) => (s || '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
    const rawList = rawRows || [];
    const reList = recomputedRows || [];
    if (rawList.length !== reList.length) return true;
    const rawMap = new Map<string, any>();
    for (const r of rawList) rawMap.set(norm(r?.category), r);
    for (const r of reList) {
      const cur = rawMap.get(norm(r?.category));
      if (!cur) return true;
      for (const m of TAX_STATUTORY_MONTH_COLS) {
        const cv = cur[m] === null || cur[m] === undefined ? null : Number(cur[m]);
        const rv = r[m] === null || r[m] === undefined ? null : Number(r[m]);
        if (cv !== rv) return true;
      }
      if (Number(cur.fy_to_date) !== Number(r.fy_to_date)) return true;
      if (Number(cur.shares) !== Number(r.shares)) return true;
    }
    return false;
  },

  // Persist corrected fss_outflow_tax_statutory rows: upsert the given rows and drop stale records.
  async persistTaxStatutoryRows(rows: any[]): Promise<void> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const computed = rows || [];
    const normalize = (value: any) => String(value || '').trim().toLowerCase();
    const { data: existing, error: loadError } = await supabase
      .from('fss_outflow_tax_statutory')
      .select('*');
    if (loadError) throw loadError;

    const desired = new Map<string, any>();
    for (const r of computed) {
      const category = String(r?.category || '').trim();
      if (category) desired.set(normalize(category), { ...r, category });
    }
    const existingByCategory = new Map<string, any[]>();
    for (const row of existing || []) {
      const key = normalize(row.category);
      existingByCategory.set(key, [...(existingByCategory.get(key) || []), row]);
    }

    const nullableNumber = (value: any): number | null => {
      if (value === null || value === undefined || String(value).trim() === '') return null;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) throw new Error(`Invalid numeric value in Tax & Statutory data: ${value}`);
      return Math.round(numeric * 100) / 100;
    };

    // Delete categories removed from the UI and duplicate cloud rows first.
    for (const [key, matches] of existingByCategory) {
      if (!desired.has(key) || matches.length > 1) {
        const categoryNames = [...new Set(matches.map((row: any) => String(row.category || '')))];
        for (const category of categoryNames) {
          const { error } = await supabase.from('fss_outflow_tax_statutory').delete().eq('category', category);
          if (error) throw error;
        }
      }
    }

    for (const [key, r] of desired) {
      const payload: Record<string, any> = { category: r.category };
      for (const m of TAX_STATUTORY_MONTH_COLS) {
        payload[m] = nullableNumber(r[m]);
      }
      payload.fy_to_date = nullableNumber(r.fy_to_date);
      payload.shares = nullableNumber(r.shares);

      const matches = existingByCategory.get(key) || [];
      const surviving = matches.length === 1 && desired.has(key) ? matches[0] : null;
      const result = surviving
        ? await supabase
          .from('fss_outflow_tax_statutory')
          .update(payload)
          .eq('category', surviving.category)
        : await supabase.from('fss_outflow_tax_statutory').insert(payload);
      if (result.error) throw result.error;
    }
  },

  async loadTaxStatutoryFromSupabase(): Promise<any[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('fss_outflow_tax_statutory')
        .select('*')
        .order('category', { ascending: true });
      if (error) {
        console.error('Error loading fss_outflow_tax_statutory from Supabase:', error);
        return [];
      }
      const recomputed = recomputeTaxStatutoryFyAndShares(data || []);
      // Keep Supabase in sync with the Tax & Statutory UI data: persist corrected rows
      // whenever the stored values (monthly totals, FY-to-date or shares) are out of sync.
      if (this.isTaxStatutoryDirty(data || [], recomputed)) {
        await this.persistTaxStatutoryRows(recomputed);
      }
      return recomputed;
    } catch (err) {
      console.error('Exception loading fss_outflow_tax_statutory from Supabase:', err);
      return [];
    }
  },

  async updateTaxStatutoryCell(
    idOrCategory: number | string,
    monthCol: string,
    newValue: number | string
  ): Promise<{ updatedRow: any; allRows: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const validMonthCols = TAX_STATUTORY_MONTH_COLS;
    const cleanCol = (monthCol || '').toLowerCase().trim();
    if (!validMonthCols.includes(cleanCol)) {
      throw new Error(`Invalid month column: ${monthCol}`);
    }

    const numVal = Number(newValue);
    const isJanFebMar = ['jan_26', 'feb_26', 'mar_26'].includes(cleanCol);
    const cleanVal = isNaN(numVal) || numVal < 0 ? (isJanFebMar ? null : 0) : Math.round(numVal * 100) / 100;

    const categoryKey = String(idOrCategory ?? '').trim();
    const { data: currentRow, error: selErr } = await supabase
      .from('fss_outflow_tax_statutory')
      .select('*')
      .ilike('category', categoryKey)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!currentRow) {
      throw new Error(`Record "${idOrCategory}" not found in fss_outflow_tax_statutory.`);
    }

    const { data: updated, error: updErr } = await supabase
      .from('fss_outflow_tax_statutory')
      .update({ [cleanCol]: cleanVal })
      .eq('category', currentRow.category)
      .select()
      .single();

    if (updErr) {
      console.error('Error updating fss_outflow_tax_statutory record:', updErr);
      throw updErr;
    }

    // Fetch all records, recompute parent totals, fy_to_date, shares
    const { data: allRaw } = await supabase
      .from('fss_outflow_tax_statutory')
      .select('*')
      .order('category', { ascending: true });
    const recomputed = recomputeTaxStatutoryFyAndShares(allRaw || []);

    // Synchronize parent group row in Supabase
    const parentRow = recomputed.find((r: any) => String(r.category || '').toLowerCase() === 'tax & statutory');
    if (parentRow) {
      const parentPayload: Record<string, any> = {
        fy_to_date: parentRow.fy_to_date,
        shares: parentRow.shares
      };
      for (const m of TAX_STATUTORY_MONTH_COLS) {
        parentPayload[m] = parentRow[m] !== undefined ? parentRow[m] : null;
      }
      await supabase
        .from('fss_outflow_tax_statutory')
        .update(parentPayload)
        .eq('category', parentRow.category);
    }

    // Also update fy_to_date and shares for updated row in Supabase
    const updatedComputed = recomputed.find((r: any) => r.category === currentRow.category) || updated;
    if (updatedComputed) {
      await supabase
        .from('fss_outflow_tax_statutory')
        .update({
          fy_to_date: updatedComputed.fy_to_date,
          shares: updatedComputed.shares
        })
        .eq('category', currentRow.category);
    }

    return { updatedRow: updatedComputed, allRows: recomputed };
  },

  async addTaxStatutoryExpense(
    categoryName: string,
    monthlyAmounts: Record<string, number> = {}
  ): Promise<any> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const trimmed = (categoryName || '').trim();
    if (!trimmed) throw new Error('Category name is required.');
    if (trimmed.toLowerCase().includes('total') || trimmed.toLowerCase() === 'tax & statutory') {
      throw new Error('Cannot add a record named "Total" or "Tax & statutory".');
    }

    const payload: Record<string, any> = { category: trimmed };
    for (const m of TAX_STATUTORY_MONTH_COLS) {
      const isJanFebMar = ['jan_26', 'feb_26', 'mar_26'].includes(m);
      payload[m] = monthlyAmounts[m] !== undefined
        ? Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100
        : (isJanFebMar ? null : 0);
    }

    const { data: existing } = await supabase
      .from('fss_outflow_tax_statutory')
      .select('*')
      .ilike('category', trimmed);

    if (existing && existing.length > 0) {
      const ex = existing[0];
      const updatePayload: Record<string, any> = {};
      for (const m of TAX_STATUTORY_MONTH_COLS) {
        if (monthlyAmounts[m] !== undefined) {
          updatePayload[m] = Math.round(Number(monthlyAmounts[m] || 0) * 100) / 100;
        } else {
          updatePayload[m] = ex[m];
        }
      }
      await supabase
        .from('fss_outflow_tax_statutory')
        .update(updatePayload)
        .eq('category', ex.category);
    } else {
      await supabase
        .from('fss_outflow_tax_statutory')
        .insert(payload);
    }

    const allRows = await this.loadTaxStatutoryFromSupabase();
    return allRows.find((r: any) => r.category === trimmed) || allRows[0];
  },

  async syncTaxStatutoryToSupabase(taxStatutoryRows: any[]): Promise<{ taxStatutory: any[] }> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const rows = recomputeTaxStatutoryFyAndShares(taxStatutoryRows || []);
    await this.persistTaxStatutoryRows(rows);
    const loaded = await this.loadTaxStatutoryFromSupabase();
    if (rows.length > 0 && loaded.length === 0) {
      throw new Error('Tax & Statutory rows were saved but could not be reloaded from Supabase.');
    }
    return { taxStatutory: loaded };
  },

  async deleteTaxStatutory(idOrKey: any, monthCol?: string): Promise<boolean> {
    if (monthCol) {
      const cleanMonth = String(monthCol || '').toLowerCase().trim();
      const validMonthCols = TAX_STATUTORY_MONTH_COLS;
      if (!validMonthCols.includes(cleanMonth)) return false;
      const categoryKey = String(idOrKey ?? '').trim();
      const { data: currentRow, error: selErr } = await supabase
        .from('fss_outflow_tax_statutory')
        .select('*')
        .ilike('category', categoryKey)
        .maybeSingle();
      if (selErr || !currentRow) {
        console.warn(`No matching record found in fss_outflow_tax_statutory for key:`, categoryKey);
        return false;
      }
      const isJanFebMar = ['jan_26', 'feb_26', 'mar_26'].includes(cleanMonth);
      const { error: updErr } = await supabase
        .from('fss_outflow_tax_statutory')
        .update({ [cleanMonth]: isJanFebMar ? null : 0 })
        .eq('category', currentRow.category);
      if (updErr) {
        console.error('Error zeroing fss_outflow_tax_statutory month column:', updErr);
        return false;
      }
      const { data: allRaw } = await supabase.from('fss_outflow_tax_statutory').select('*');
      const recomputed = recomputeTaxStatutoryFyAndShares(allRaw || []);
      const parentRow = recomputed.find((r: any) => String(r.category || '').toLowerCase() === 'tax & statutory');
      if (parentRow) {
        const parentPayload: Record<string, any> = {
          fy_to_date: parentRow.fy_to_date,
          shares: parentRow.shares
        };
        for (const m of TAX_STATUTORY_MONTH_COLS) {
          const isJanFebMar = ['jan_26', 'feb_26', 'mar_26'].includes(m);
          parentPayload[m] = isJanFebMar ? null : Math.round(Number(parentRow[m] || 0) * 100) / 100;
        }
        await supabase.from('fss_outflow_tax_statutory').update(parentPayload).eq('category', parentRow.category);
      }
      return true;
    }
    const ok = await this.deleteOutflowRecord('fss_outflow_tax_statutory', idOrKey, 'category');
    if (ok && supabase) {
      const { data: allRaw } = await supabase.from('fss_outflow_tax_statutory').select('*');
      const recomputed = recomputeTaxStatutoryFyAndShares(allRaw || []);
      const parentRow = recomputed.find((r: any) => String(r.category || '').toLowerCase() === 'tax & statutory');
      if (parentRow) {
        const payload: Record<string, any> = {
          fy_to_date: parentRow.fy_to_date,
          shares: parentRow.shares
        };
        for (const m of TAX_STATUTORY_MONTH_COLS) {
          const isJanFebMar = ['jan_26', 'feb_26', 'mar_26'].includes(m);
          payload[m] = isJanFebMar ? null : Math.round(Number(parentRow[m] || 0) * 100) / 100;
        }
        await supabase
          .from('fss_outflow_tax_statutory')
          .update(payload)
          .eq('category', parentRow.category);
      }
    }
    return ok;
  },
  async deleteTaxStatutoryExpense(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteTaxStatutory(idOrKey, monthCol);
  },
  async deleteTaxStatutoryFromSupabase(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteTaxStatutory(idOrKey, monthCol);
  },
  async deleteTaxStatutoryRow(idOrKey: any, monthCol?: string): Promise<boolean> {
    return this.deleteTaxStatutory(idOrKey, monthCol);
  },

  // Office travel outflow (table may exist in Supabase)
  async deleteOfficeTravel(idOrKey: any): Promise<boolean> {
    return this.deleteOutflowRecord('fss_outflow_oc_office_travel', idOrKey, 'category');
  },
  async deleteOfficeTravelExpense(idOrKey: any): Promise<boolean> {
    return this.deleteOfficeTravel(idOrKey);
  },
  async deleteOfficeTravelFromSupabase(idOrKey: any): Promise<boolean> {
    return this.deleteOfficeTravel(idOrKey);
  },
  async deleteOfficeTravelRow(idOrKey: any): Promise<boolean> {
    return this.deleteOfficeTravel(idOrKey);
  },
};

export function getFinancialYear(dateStr: string): string {
  if (!dateStr) return '2026-27';
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month)) return '2026-27';
  const startYear = month >= 4 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYearShort}`;
}
