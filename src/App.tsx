import React, { useEffect, useState, useCallback } from 'react';
import { boot, go, route, render, S, api, Store, FileStore, computeCashflowInflowRows, computeCashflowPeopleRows, computeCashflowOutflowProjectCostRows, computeCashflowOutflowCapexRows, computeCashflowOutflowFinancingAndOwnerRows, computeCashflowOutflowOfficeFixedRows, computeCashflowOutflowOfficeVariableRows, computeCashflowOutflowTravelRows, computeCashflowOutflowProfessionalAdminRows, computeCashflowOutflowTaxStatutoryRows } from './lib/coreEngine';
import { SupabaseService, isSupabaseConfigured, STATE_NAME_TO_CODE, STATE_CODE_TO_NAME } from './lib/supabase';
import { AddClientModal } from './components/AddClientModal';
import { AddVendorModal } from './components/AddVendorModal';
import { AddEmployeeModal } from './components/AddEmployeeModal';
import { AddOtherPartyModal } from './components/AddOtherPartyModal';
import { AddProjectModal } from './components/AddProjectModal';
import { AddDepartmentModal } from './components/AddDepartmentModal';
import { AddBankAccountModal } from './components/AddBankAccountModal';
import { AddCategoryModal } from './components/AddCategoryModal';
import './styles/index.css';

export interface CloudStatus {
  configured: boolean;
  connected: boolean;
  syncing: boolean;
  lastSynced: string | null;
  error: string | null;
  clientCount?: number;
  vendorCount?: number;
  employeeCount?: number;
  otherPartyCount?: number;
  projectCount?: number;
  departmentCount?: number;
  bankAccountCount?: number;
  categoryCount?: number;
  orderCount?: number;
  transactionCount?: number;
  operationReceiptCount?: number;
  incomeCount?: number;
  financingCount?: number;
  cashInflowCount?: number;
  peopleCount?: number;
  projectCostCount?: number;
  capexCount?: number;
}

// Convert Supabase fss_client and fss_client_people rows into CRM party format
export function convertFssClientToParty(client: any, people: any[] = []) {
  const contacts = (people || []).map((p: any, idx: number) => {
    const tags: string[] = [];
    if (p.receives_accounts) tags.push('accounts');
    if (p.receives_projects) tags.push('projects');
    if (p.receives_management) tags.push('management');
    return {
      id: p.id || `ct_${idx}`,
      name: p.name || '',
      designation: p.designation || '',
      email: p.email || '',
      phone: p.phone || '',
      whatsapp: Boolean(p.on_whatsapp),
      tags
    };
  });

  const rawState = (client.state || '').trim();
  const stateCode = STATE_NAME_TO_CODE[rawState.toLowerCase()] || (STATE_CODE_TO_NAME[rawState] ? rawState : '');

  return {
    id: client.id,
    kind: 'client',
    name: client.client_name,
    gstin: client.gstin || '',
    stateCode: stateCode,
    state: rawState || (stateCode ? STATE_CODE_TO_NAME[stateCode] : ''),
    address: client.billing_address || '',
    pincode: client.pin_code || '',
    pan: client.pan || '',
    tan: client.tan || '',
    gstType: (client.default_gst_type || '').toLowerCase().includes('igst') ? 'inter' : 'intra',
    creditDays: client.credit_period ?? 30,
    notes: client.notes || '',
    bank: client.bank_account_number ? {
      accName: client.bank_account_name || '',
      bankName: client.bank_name || '',
      accNo: client.bank_account_number || '',
      ifsc: client.bank_ifsc || '',
      upi: ''
    } : null,
    contacts,
    email: contacts.map((c: any) => c.email).filter(Boolean).join(', '),
    phone: contacts.find((c: any) => c.phone)?.phone || '',
    active: client.status !== 'Inactive',
    createdAt: client.created_at || new Date().toISOString()
  };
}

// Convert Supabase fss_vendor and fss_vendor_people rows into CRM party format
export function convertFssVendorToParty(vendor: any, people: any[] = []) {
  const contacts = (people || []).map((p: any, idx: number) => {
    const tags: string[] = [];
    if (p.receives_accounts) tags.push('accounts');
    if (p.receives_projects) tags.push('projects');
    if (p.receives_management) tags.push('management');
    return {
      id: p.id || `ct_${idx}`,
      name: p.name || '',
      designation: p.designation || '',
      email: p.email || '',
      phone: p.phone || '',
      whatsapp: Boolean(p.on_whatsapp),
      tags
    };
  });

  const rawState = (vendor.state || '').trim();
  const stateCode = STATE_NAME_TO_CODE[rawState.toLowerCase()] || (STATE_CODE_TO_NAME[rawState] ? rawState : '');
  const hasBank = vendor.account_number || vendor.ifsc_code || vendor.bank_name || vendor.account_holder_name || vendor.upi_id;

  return {
    id: vendor.id,
    kind: 'vendor',
    name: vendor.vendor_name,
    gstin: vendor.gstin || '',
    stateCode: stateCode,
    state: rawState || (stateCode ? STATE_CODE_TO_NAME[stateCode] : ''),
    address: vendor.billing_address || '',
    pincode: vendor.pin_code || '',
    pan: vendor.pan || '',
    tan: '',
    gstType: (vendor.default_gst_type || '').toLowerCase().includes('igst') ? 'inter' : 'intra',
    creditDays: vendor.credit_period ?? 30,
    notes: vendor.notes || '',
    bank: hasBank ? {
      accName: vendor.account_holder_name || '',
      bankName: vendor.bank_name || '',
      accNo: vendor.account_number || '',
      ifsc: vendor.ifsc_code || '',
      upi: vendor.upi_id || ''
    } : null,
    contacts,
    email: contacts.map((c: any) => c.email).filter(Boolean).join(', '),
    phone: contacts.find((c: any) => c.phone)?.phone || '',
    active: vendor.status !== 'Inactive',
    createdAt: vendor.created_at || new Date().toISOString()
  };
}

// Convert Supabase fss_employe rows into CRM party format
export function convertFssEmployeToParty(emp: any, departments: any[] = []) {
  const rawDept = (emp.department || '').trim();
  const matchedDept = (departments || []).find((d: any) =>
    d.name.toLowerCase() === rawDept.toLowerCase() || d.id === rawDept
  );
  const departmentId = matchedDept ? matchedDept.id : 'dep_ops';

  return {
    id: String(emp.id),
    supabase_id: emp.id,
    kind: 'employee',
    name: emp.name,
    departmentId,
    designation: emp.designation || '',
    monthlySalary: Number(emp.monthly_salary) || 0,
    joinDate: emp.joined || '',
    email: emp.emails || '',
    phone: emp.phone || '',
    active: emp.is_active !== false,
    createdAt: emp.created_at || new Date().toISOString()
  };
}

// Convert Supabase fss_other_parties rows into CRM party format
export function convertFssOtherPartyToParty(op: any) {
  let gstType = 'none';
  if (op.default_gst_type === 'Regular GST') gstType = 'intra';
  else if (op.default_gst_type === 'Composition GST') gstType = 'Composition GST';
  else if (op.default_gst_type === 'Unregistered') gstType = 'Unregistered';
  else gstType = 'none';

  return {
    id: String(op.id),
    supabase_id: op.id,
    kind: 'other',
    name: op.name,
    gstin: op.gstin || '',
    gstType,
    email: op.emails || '',
    phone: op.phone || '',
    active: op.is_active !== false,
    createdAt: op.created_at || new Date().toISOString()
  };
}

// Convert Supabase fss_projects rows into CRM project format
export function convertFssProjectToLocal(proj: any, clients: any[] = [], departments: any[] = []) {
  // Resolve clientId
  let clientId = '';
  const clientList = (clients || []).filter((c: any) => c.kind === 'client');
  const numClientId = Number(proj.client_id);
  if (!isNaN(numClientId) && numClientId > 0 && numClientId <= clientList.length) {
    clientId = clientList[numClientId - 1].id;
  } else {
    const match = clientList.find((c: any) => c.id === String(proj.client_id) || c.supabase_id === proj.client_id);
    clientId = match ? match.id : (clientList[0]?.id || 'cl_nw');
  }

  // Resolve departmentId
  const rawDept = (proj.department || '').trim();
  const matchedDept = (departments || []).find((d: any) =>
    d.name.toLowerCase() === rawDept.toLowerCase() || d.id === rawDept
  );
  const departmentId = matchedDept ? matchedDept.id : 'dep_design';

  // Map status
  let status = 'active';
  const rawStatus = (proj.status || '').toLowerCase();
  if (rawStatus === 'completed') status = 'completed';
  else if (rawStatus === 'on hold' || rawStatus === 'on-hold') status = 'on-hold';
  else if (rawStatus === 'inactive') status = 'inactive';
  else status = 'active';

  return {
    id: String(proj.id),
    supabase_id: proj.id,
    code: proj.project_code,
    name: proj.project_name,
    clientId,
    departmentId,
    contractValue: Number(proj.contract_value) || 0,
    startDate: proj.start_date || '',
    status,
    active: status !== 'inactive',
    createdAt: proj.created_at || new Date().toISOString()
  };
}

// Convert Supabase fss_departments rows into CRM department format
export function convertFssDepartmentToLocal(dept: any) {
  return {
    id: String(dept.id),
    supabase_id: dept.id,
    name: dept.department_name,
    managerName: dept.manager || '',
    managerEmail: dept.manager_email || '',
    active: true,
    createdAt: dept.created_at || new Date().toISOString()
  };
}

// Convert Supabase fss_bank_accounts rows into CRM bank account format
export function convertFssBankAccountToLocal(acc: any) {
  let localType: 'bank' | 'cash' | 'fd' = 'bank';
  const rawType = (acc.account_type || '').toLowerCase();
  if (rawType === 'cash') localType = 'cash';
  else if (rawType === 'fixed deposit' || rawType === 'fd') localType = 'fd';
  else localType = 'bank';

  return {
    id: String(acc.id),
    supabase_id: acc.id,
    name: acc.account_name,
    type: localType,
    number: acc.account_number_masked || '',
    openingBalance: Number(acc.opening_balance) || 0,
    openingBalanceDate: acc.opening_balance_date || '2025-04-01',
    active: true,
    createdAt: acc.created_at || new Date().toISOString()
  };
}

// Convert Supabase fss_categories rows into CRM category format
export function convertFssCategoryToLocal(sc: any, existingCategories: any[] = []) {
  const match = (existingCategories || []).find((c: any) =>
    (c.supabase_id && c.supabase_id === sc.id) ||
    (c.name && c.name.trim().toLowerCase() === (sc.category_name || '').trim().toLowerCase())
  );
  const localId = match ? match.id : `cat_${sc.id}`;

  let type: 'outflow' | 'inflow' = 'outflow';
  if (sc.fss_type?.name) {
    type = sc.fss_type.name.toLowerCase() === 'inflow' ? 'inflow' : 'outflow';
  } else if (sc.type_id === 3) {
    type = 'inflow';
  }

  const group = sc.fss_category_group?.name || match?.group || (type === 'inflow' ? 'Operating Receipts' : 'Office – Fixed');

  let partyKind: 'client' | 'vendor' | 'employee' | 'other' = 'vendor';
  const rawLinked = sc.fss_category_linked_to?.name || match?.partyKind || '';
  if (rawLinked.toLowerCase().includes('client')) partyKind = 'client';
  else if (rawLinked.toLowerCase().includes('employee')) partyKind = 'employee';
  else if (rawLinked.toLowerCase().includes('other')) partyKind = 'other';
  else partyKind = 'vendor';

  let kind: 'operating' | 'tax' | 'capex' | 'financing' = 'operating';
  const rawNature = sc.fss_category_nature?.name || match?.kind || '';
  if (rawNature.toLowerCase().includes('statutory') || rawNature.toLowerCase().includes('tax')) kind = 'tax';
  else if (rawNature.toLowerCase().includes('capex')) kind = 'capex';
  else if (rawNature.toLowerCase().includes('financing') || rawNature.toLowerCase().includes('owner')) kind = 'financing';
  else kind = 'operating';

  let bucket = match?.bucket || '';
  const rawBucket = sc.fss_category_summary_bucket?.name || '';
  if (rawBucket) {
    const lb = rawBucket.toLowerCase();
    if (lb.includes('project costs')) bucket = 'proj_cost';
    else if (lb.includes('tax') || lb.includes('statutory')) bucket = 'tax';
    else if (lb.includes('capex')) bucket = 'capex';
    else if (lb.includes('financing & owner') || (type === 'outflow' && lb.includes('financing'))) bucket = 'fin_out';
    else if (lb.includes('operating receipts')) bucket = 'op_rec';
    else if (lb.includes('other income')) bucket = 'oth_inc';
    else if (lb.includes('financing (inflow)') || (type === 'inflow' && lb.includes('financing'))) bucket = 'fin_in';
    else if (lb.includes('operating costs')) bucket = 'op_cost';
  }
  if (!bucket) {
    if (type === 'inflow') {
      bucket = (kind === 'financing' || (sc.category_name || '').toLowerCase().includes('loan') || (sc.category_name || '').toLowerCase().includes('capital')) ? 'fin_in' : (group.toLowerCase().includes('other income') ? 'oth_inc' : 'op_rec');
    } else {
      if (group === 'Project Costs') bucket = 'proj_cost';
      else bucket = ({ tax: 'tax', capex: 'capex', financing: 'fin_out' } as any)[kind] || 'op_cost';
    }
  }

  const tdsSection = sc.fss_category_tds_section?.code || match?.tdsSection || '';
  const sac = sc.sac_code || match?.sac || '';
  const itcBlocked = sc.input_gst_on_bills
    ? sc.input_gst_on_bills.toLowerCase().includes('blocked')
    : Boolean(match?.itcBlocked);

  return {
    id: localId,
    supabase_id: sc.id,
    name: sc.category_name,
    type,
    group,
    bucket,
    partyKind,
    kind,
    sac,
    itcBlocked,
    tdsSection,
    active: true,
    createdAt: sc.created_at || new Date().toISOString()
  };
}

// Convert Supabase fss_table_order_po rows into CRM order format
export function convertFssOrderToLocal(
  so: any,
  existingOrders: any[] = [],
  clients: any[] = [],
  projects: any[] = [],
  departments: any[] = []
) {
  const orderNum = (so.po_number || so.order_number || '').trim();
  const match = (existingOrders || []).find((o: any) =>
    (o.supabase_id && o.supabase_id === so.id) ||
    (o.orderNo && o.orderNo.trim().toLowerCase() === orderNum.toLowerCase())
  );
  const localId = match ? match.id : (so.id ? `ord_${so.id}` : `ord_${Date.now()}`);

  let type: 'PO' | 'LOI' | 'Email' | 'Contract' = match?.type || 'PO';
  const rawType = (so.order_type || '').toUpperCase();
  if (rawType === 'EMAIL' || orderNum.toLowerCase().startsWith('email')) type = 'Email';
  else if (rawType === 'CONTRACT' || orderNum.toLowerCase().startsWith('contract')) type = 'Contract';
  else if (rawType === 'LOI' || orderNum.toLowerCase().startsWith('loi')) type = 'LOI';
  else if (rawType === 'PO' || orderNum.toLowerCase().startsWith('po')) type = 'PO';

  // Details from child relation fss_table_order_details
  const det = Array.isArray(so.fss_table_order_details)
    ? so.fss_table_order_details[0]
    : (so.fss_table_order_details || {});

  // Departments from child relation fss_table_order_departments
  const rawDepts = so.fss_table_order_departments || so.departments || [];
  const dept0 = rawDepts[0] || {};

  const gstRate = Number(dept0.gst_rate ?? so.gst_rate ?? match?.gstRate ?? 18);

  let gstType: 'intra' | 'inter' | 'none' = 'intra';
  const rawGst = String(dept0.gst_type ?? so.gst_type ?? match?.gstType ?? '').toUpperCase();
  if (rawGst === 'IGST' || rawGst.includes('INTER')) gstType = 'inter';
  else if (rawGst === 'NONE' || gstRate === 0) gstType = 'none';
  else gstType = 'intra';

  let status: 'active' | 'closed' | 'cancelled' = 'active';
  const rawStatus = (so.status || '').toLowerCase();
  if (rawStatus === 'completed' || rawStatus === 'closed') status = 'closed';
  else if (rawStatus === 'cancelled') status = 'cancelled';
  else status = 'active';

  // Resolve clientId
  let clientId = match?.clientId || '';
  if (so.client_id) {
    const cMatch = (clients || []).find((c: any) => c.id === so.client_id || c.supabase_id === so.client_id);
    if (cMatch) clientId = cMatch.id;
    else if (!clientId) clientId = String(so.client_id);
  }
  if (!clientId && so.client_name) {
    const cMatch = (clients || []).find((c: any) => c.name && c.name.trim().toLowerCase() === so.client_name.trim().toLowerCase());
    if (cMatch) clientId = cMatch.id;
  }
  if (!clientId && (clients || []).length > 0) {
    clientId = clients[0].id;
  }

  // Resolve projectId
  let projectId = match?.projectId || '';
  if (so.project_id) {
    const pMatch = (projects || []).find((p: any) => p.id === so.project_id || p.supabase_id === so.project_id);
    if (pMatch) projectId = pMatch.id;
    else if (!projectId) projectId = String(so.project_id);
  }
  if (!projectId && so.project_name) {
    const pMatch = (projects || []).find((p: any) => p.name && p.name.trim().toLowerCase() === so.project_name.trim().toLowerCase());
    if (pMatch) projectId = pMatch.id;
  }

  // Pre-GST total and departments split
  const sumDeptAmt = rawDepts.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
  const totalTaxable = Number(dept0.order_value_pre_gst ?? so.pre_gst_amount) || sumDeptAmt || Number(match?.taxable) || 0;

  const split: any[] = [];
  rawDepts.forEach((d: any) => {
    const dName = (d.department_name || '').trim();
    const matchedDept = (departments || []).find((dept: any) =>
      (dept.name && dept.name.trim().toLowerCase() === dName.toLowerCase()) ||
      dept.id === dName
    );
    const depId = matchedDept ? matchedDept.id : (departments[0]?.id || 'dep_design');
    const amt = Number(d.amount) || 0;
    const existing = split.find(x => x.departmentId === depId);
    if (!existing) {
      const pct = totalTaxable > 0 ? (amt / totalTaxable) * 100 : 0;
      split.push({
        departmentId: depId,
        department_name: matchedDept ? matchedDept.name : dName,
        amount: amt,
        pct
      });
    }
  });

  const departmentId = split[0]?.departmentId || match?.departmentId || departments[0]?.id || 'dep_design';
  const finalSplit = split.length > 1 ? split : [];

  // Resolve milestones / payment terms
  const rawTerms = so.fss_table_order_payment_terms || so.fss_table_order_milestones || so.milestones || [];
  const sortedTerms = rawTerms.slice().sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0));
  const terms = sortedTerms.map((m: any) => ({
    label: m.milestone_name || 'Milestone',
    milestone_name: m.milestone_name || 'Milestone',
    pct: Number(m.percentage) || 0,
    amount: Number(m.milestone_amount ?? m.amount) || 0,
    is_balance: Boolean(m.is_balance)
  }));

  // Resolve documents / attachments
  const rawDocs = so.fss_table_order_documents || so.documents || [];
  let attachments = rawDocs.map((doc: any) => ({
    id: doc.id,
    name: doc.file_name,
    path: doc.storage_path,
    type: doc.content_type || '',
    size: Number(doc.file_size_bytes) || 0
  }));

  if (attachments.length === 0 && (det.document_name || det.document_path || det.document_url)) {
    attachments = [{
      id: det.id,
      name: det.document_name || 'Attachment',
      path: det.document_path || det.document_url || '',
      url: det.document_url || ''
    }];
  }

  const totalAmount = Number(dept0.order_total_incl_gst ?? so.total_amount) || Math.round(totalTaxable + (totalTaxable * gstRate / 100));
  const gstAmount = Number(so.gst_amount) || Math.max(0, totalAmount - totalTaxable);

  return {
    id: localId,
    supabase_id: so.id,
    orderNo: orderNum,
    type,
    date: so.order_date || new Date().toISOString().split('T')[0],
    clientId,
    projectId,
    clientName: so.client_name || '',
    projectName: so.project_name || '',
    departmentId,
    split: split.length > 1 ? split : [],
    scope: so.scope || det.scope || '',
    taxable: totalTaxable,
    gstRate,
    gstType,
    gstAmount,
    total: totalAmount,
    terms: terms.length > 0 ? terms : [{ label: 'Full payment', pct: 100 }],
    expectedCompletion: so.expected_completion || det.expected_completion || '',
    contact: so.client_contact || det.client_contact || '',
    notes: so.notes || det.notes || '',
    attachments: attachments.length > 0 ? attachments : (match?.attachments || []),
    status,
    createdAt: so.created_at || new Date().toISOString(),
    updatedAt: so.updated_at || new Date().toISOString(),
    deleted: false
  };
}

// Convert Supabase fss_table_transactions rows into CRM entry format
export function convertFssTransactionToLocal(
  tx: any,
  existingEntries: any[] = [],
  parties: any[] = [],
  projects: any[] = [],
  departments: any[] = [],
  categories: any[] = [],
  accounts: any[] = []
) {
  const match = (existingEntries || []).find((e: any) =>
    (e.supabase_id && e.supabase_id === tx.id) ||
    (tx.reference_number && e.refNo && e.refNo.trim().toLowerCase() === tx.reference_number.trim().toLowerCase())
  );
  const localId = match ? match.id : (tx.id ? `e_${tx.id}` : `e_${Date.now()}`);

  const rawType = (tx.transaction_type || '').toLowerCase();
  const type: 'inflow' | 'outflow' = rawType === 'inflow' ? 'inflow' : 'outflow';

  // Resolve Party
  let partyId = match?.partyId || '';
  if (tx.party_name) {
    const pMatch = (parties || []).find((p: any) => p.name && p.name.trim().toLowerCase() === tx.party_name.trim().toLowerCase());
    if (pMatch) partyId = pMatch.id;
  }

  // Resolve Party Kind
  let partyKind = match?.partyKind || (type === 'inflow' ? 'client' : 'vendor');
  if (partyId) {
    const pMatch = (parties || []).find((p: any) => p.id === partyId);
    if (pMatch) partyKind = pMatch.kind;
  }

  // Resolve Project
  let projectId = match?.projectId || '';
  if (tx.project_code || tx.project_name) {
    const prMatch = (projects || []).find((pr: any) =>
      (tx.project_code && pr.code && pr.code.trim().toLowerCase() === tx.project_code.trim().toLowerCase()) ||
      (tx.project_name && pr.name && pr.name.trim().toLowerCase() === tx.project_name.trim().toLowerCase())
    );
    if (prMatch) projectId = prMatch.id;
  }

  // Resolve Department
  let departmentId = match?.departmentId || '';
  if (tx.department) {
    const dMatch = (departments || []).find((d: any) => d.name && d.name.trim().toLowerCase() === tx.department.trim().toLowerCase());
    if (dMatch) departmentId = dMatch.id;
  }
  if (!departmentId && (departments || []).length > 0) {
    departmentId = departments[0].id;
  }

  // Resolve Category
  let categoryId = match?.categoryId || '';
  if (tx.category) {
    const cMatch = (categories || []).find((c: any) => c.name && c.name.trim().toLowerCase() === tx.category.trim().toLowerCase());
    if (cMatch) categoryId = cMatch.id;
  }
  if (!categoryId && (categories || []).length > 0) {
    const fallbackCat = (categories || []).find((c: any) => type === 'inflow' ? c.type === 'inflow' : c.type === 'outflow');
    categoryId = fallbackCat ? fallbackCat.id : categories[0].id;
  }

  // Resolve Account
  let accountId = match?.accountId || '';
  if (tx.account_name) {
    const aMatch = (accounts || []).find((a: any) => a.name && a.name.trim().toLowerCase() === tx.account_name.trim().toLowerCase());
    if (aMatch) accountId = aMatch.id;
  }
  if (!accountId && (accounts || []).length > 0) {
    accountId = accounts[0].id;
  }

  const taxable = Number(tx.taxable_amount) || 0;
  const gstRate = Number(tx.gst_rate) || 0;
  const gstAmount = Number(tx.gst_amount) || 0;
  const tdsAmount = Number(tx.tds_amount) || 0;
  const netAmount = Math.abs(Number(tx.net_cash)) || Math.abs(taxable + gstAmount - tdsAmount);
  const taxPeriodMatch = String(tx.description || '').match(/for (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})/i);
  const taxPeriod = taxPeriodMatch
    ? `${taxPeriodMatch[2]}-${String(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(taxPeriodMatch[1].toLowerCase()) + 1).padStart(2, '0')}`
    : undefined;

  return {
    id: localId,
    supabase_id: tx.id,
    type,
    date: tx.transaction_date || new Date().toISOString().split('T')[0],
    categoryId,
    departmentId,
    partyKind,
    partyId: partyId || undefined,
    projectId: projectId || undefined,
    description: tx.description || '',
    taxPeriod: taxPeriod || match?.taxPeriod,
    refNo: tx.reference_number || '',
    taxable,
    gstType: (gstAmount > 0 ? 'intra' : 'none') as 'intra' | 'none',
    gstRate,
    gstAmount,
    itc: type === 'outflow' && gstAmount > 0,
    tdsRate: taxable > 0 && tdsAmount > 0 ? Math.round((tdsAmount / taxable) * 100) : 0,
    tdsAmount,
    amount: netAmount,
    paymentMode: tx.payment_mode || 'NEFT',
    accountId,
    notes: tx.notes || '',
    status: tx.status || 'Active',
    deleted: tx.status === 'Cancelled',
    createdAt: tx.created_at || new Date().toISOString(),
    updatedAt: tx.updated_at || new Date().toISOString()
  };
}

export const App: React.FC = () => {
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>({
    configured: isSupabaseConfigured,
    connected: false,
    syncing: false,
    lastSynced: null,
    error: null,
    clientCount: 0,
    vendorCount: 0,
    employeeCount: 0,
    otherPartyCount: 0,
    projectCount: 0,
    departmentCount: 0,
    bankAccountCount: 0,
    categoryCount: 0,
    orderCount: 0,
    transactionCount: 0
  });

  const [showCloudModal, setShowCloudModal] = useState<boolean>(false);
  const [showAddClientModal, setShowAddClientModal] = useState<boolean>(false);
  const [showAddVendorModal, setShowAddVendorModal] = useState<boolean>(false);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState<boolean>(false);
  const [showAddOtherPartyModal, setShowAddOtherPartyModal] = useState<boolean>(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState<boolean>(false);
  const [showAddDepartmentModal, setShowAddDepartmentModal] = useState<boolean>(false);
  const [showAddBankAccountModal, setShowAddBankAccountModal] = useState<boolean>(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState<boolean>(false);

  // Callback after adding client via AddClientModal
  const handleClientAdded = useCallback((newClient: any) => {
    if (Store.data && Store.data.parties) {
      const partyRec = convertFssClientToParty(newClient, newClient.people || []);
      const existingIdx = Store.data.parties.findIndex((p: any) => p.id === newClient.id);
      if (existingIdx >= 0) {
        Store.data.parties[existingIdx] = partyRec;
      } else {
        Store.data.parties.unshift(partyRec);
      }
      Store.persist();
      render({ keepScroll: true });
      setCloudStatus(prev => ({
        ...prev,
        clientCount: (prev.clientCount || 0) + 1,
        lastSynced: new Date().toLocaleTimeString()
      }));
    }
  }, []);

  // Callback after adding vendor via AddVendorModal
  const handleVendorAdded = useCallback((newVendor: any) => {
    if (Store.data && Store.data.parties) {
      const partyRec = convertFssVendorToParty(newVendor, newVendor.people || []);
      const existingIdx = Store.data.parties.findIndex((p: any) => p.id === newVendor.id);
      if (existingIdx >= 0) {
        Store.data.parties[existingIdx] = partyRec;
      } else {
        Store.data.parties.unshift(partyRec);
      }
      Store.persist();
      render({ keepScroll: true });
      setCloudStatus(prev => ({
        ...prev,
        vendorCount: (prev.vendorCount || 0) + 1,
        lastSynced: new Date().toLocaleTimeString()
      }));
    }
  }, []);

  // Callback after adding employee via AddEmployeeModal
  const handleEmployeeAdded = useCallback((newEmp: any) => {
    if (Store.data && Store.data.parties) {
      const partyRec = convertFssEmployeToParty(newEmp, Store.data.departments || []);
      const existingIdx = Store.data.parties.findIndex(
        (p: any) => p.supabase_id === newEmp.id || (p.kind === 'employee' && p.name.trim().toLowerCase() === newEmp.name.trim().toLowerCase())
      );
      if (existingIdx >= 0) {
        Store.data.parties[existingIdx] = { ...Store.data.parties[existingIdx], ...partyRec };
      } else {
        Store.data.parties.unshift(partyRec);
      }
      Store.persist();
      render({ keepScroll: true });
      setCloudStatus(prev => ({
        ...prev,
        employeeCount: (prev.employeeCount || 0) + 1,
        lastSynced: new Date().toLocaleTimeString()
      }));
    }
  }, []);

  // Callback after adding other party via AddOtherPartyModal
  const handleOtherPartyAdded = useCallback((newOtherParty: any) => {
    if (Store.data && Store.data.parties) {
      const partyRec = convertFssOtherPartyToParty(newOtherParty);
      const existingIdx = Store.data.parties.findIndex(
        (p: any) => p.supabase_id === newOtherParty.id || (p.kind === 'other' && p.name.trim().toLowerCase() === newOtherParty.name.trim().toLowerCase())
      );
      if (existingIdx >= 0) {
        Store.data.parties[existingIdx] = {
          ...Store.data.parties[existingIdx],
          ...partyRec,
          id: Store.data.parties[existingIdx].id // preserve local id (e.g. ot_hdfc)
        };
      } else {
        Store.data.parties.unshift(partyRec);
      }
      Store.persist();
      render({ keepScroll: true });
      setCloudStatus(prev => ({
        ...prev,
        otherPartyCount: (prev.otherPartyCount || 0) + 1,
        lastSynced: new Date().toLocaleTimeString()
      }));
    }
  }, []);

  // Callback after adding project via AddProjectModal
  const handleProjectAdded = useCallback((newProject: any) => {
    if (Store.data && Store.data.projects) {
      const projRec = convertFssProjectToLocal(newProject, Store.data.parties || [], Store.data.departments || []);
      const existingIdx = Store.data.projects.findIndex(
        (p: any) => p.supabase_id === newProject.id || (p.code && p.code.trim().toLowerCase() === newProject.project_code.trim().toLowerCase())
      );
      if (existingIdx >= 0) {
        Store.data.projects[existingIdx] = {
          ...Store.data.projects[existingIdx],
          ...projRec,
          id: Store.data.projects[existingIdx].id // preserve local id
        };
      } else {
        Store.data.projects.unshift(projRec);
      }
      Store.persist();
      render({ keepScroll: true });
      setCloudStatus(prev => ({
        ...prev,
        projectCount: (prev.projectCount || 0) + 1,
        lastSynced: new Date().toLocaleTimeString()
      }));
    }
  }, []);

  // Callback after adding department via AddDepartmentModal
  const handleDepartmentAdded = useCallback((newDept: any) => {
    if (Store.data && Store.data.departments) {
      const deptRec = convertFssDepartmentToLocal(newDept);
      const existingIdx = Store.data.departments.findIndex(
        (d: any) => d.supabase_id === newDept.id || (d.name && d.name.trim().toLowerCase() === newDept.department_name.trim().toLowerCase())
      );
      if (existingIdx >= 0) {
        Store.data.departments[existingIdx] = {
          ...Store.data.departments[existingIdx],
          ...deptRec,
          id: Store.data.departments[existingIdx].id // preserve local id
        };
      } else {
        Store.data.departments.push(deptRec);
      }
      Store.persist();
      render({ keepScroll: true });
      setCloudStatus(prev => ({
        ...prev,
        departmentCount: (prev.departmentCount || 0) + 1,
        lastSynced: new Date().toLocaleTimeString()
      }));
    }
  }, []);

  // Callback after adding bank account via AddBankAccountModal
  const handleBankAccountAdded = useCallback((newAcc: any) => {
    if (Store.data && Store.data.accounts) {
      const accRec = convertFssBankAccountToLocal(newAcc);
      const existingIdx = Store.data.accounts.findIndex(
        (a: any) => (a.supabase_id && a.supabase_id === newAcc.id) ||
                    (a.name && a.name.trim().toLowerCase() === newAcc.account_name.trim().toLowerCase())
      );
      if (existingIdx >= 0) {
        Store.data.accounts[existingIdx] = {
          ...Store.data.accounts[existingIdx],
          ...accRec,
          id: Store.data.accounts[existingIdx].id // preserve local id (e.g. acc_hdfc)
        };
      } else {
        Store.data.accounts.push(accRec);
      }
      Store.persist();
      render({ keepScroll: true });
      setCloudStatus(prev => ({
        ...prev,
        bankAccountCount: (prev.bankAccountCount || 0) + 1,
        lastSynced: new Date().toLocaleTimeString()
      }));
    }
  }, []);

  // Callback after adding category via AddCategoryModal
  const handleCategoryAdded = useCallback((newCat: any) => {
    if (Store.data && Store.data.categories) {
      const catRec = convertFssCategoryToLocal(newCat, Store.data.categories);
      const existingIdx = Store.data.categories.findIndex(
        (c: any) => (c.supabase_id && c.supabase_id === newCat.id) ||
                    (c.name && c.name.trim().toLowerCase() === (newCat.category_name || '').trim().toLowerCase())
      );
      if (existingIdx >= 0) {
        Store.data.categories[existingIdx] = {
          ...Store.data.categories[existingIdx],
          ...catRec,
          id: Store.data.categories[existingIdx].id // preserve local id (e.g. cat_sal)
        };
      } else {
        Store.data.categories.push(catRec);
      }
      Store.persist();
      render({ keepScroll: true });
      setCloudStatus(prev => ({
        ...prev,
        categoryCount: (prev.categoryCount || 0) + 1,
        lastSynced: new Date().toLocaleTimeString()
      }));
    }
  }, []);

  // Hydrate clients from Supabase fss_client
  const loadSupabaseClients = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
      let supabaseClients = await SupabaseService.loadClientsFromSupabase();

      // If fss_client is empty in Supabase, auto-seed with local active clients
      if (supabaseClients.length === 0 && Store.data?.parties) {
        const clientParties = Store.data.parties.filter((p: any) => p.kind === 'client');
        if (clientParties.length > 0) {
          console.log('fss_client table is empty in Supabase. Syncing existing clients to Supabase...');
          await SupabaseService.syncLocalClientsToSupabase(Store.data.parties);
          supabaseClients = await SupabaseService.loadClientsFromSupabase();
        }
      }

      if (supabaseClients && Store.data?.parties) {
        supabaseClients.forEach((sc: any) => {
          const partyRecord = convertFssClientToParty(sc, sc.people);
          const existingIdx = Store.data.parties.findIndex(
            (p: any) => p.id === sc.id || (p.kind === 'client' && p.name.trim().toLowerCase() === sc.client_name.trim().toLowerCase())
          );
          if (existingIdx >= 0) {
            Store.data.parties[existingIdx] = { ...Store.data.parties[existingIdx], ...partyRecord };
          } else {
            Store.data.parties.unshift(partyRecord);
          }
        });
        Store.persist();
        render({ keepScroll: true });
      }

      setCloudStatus(prev => ({
        ...prev,
        connected: true,
        syncing: false,
        clientCount: supabaseClients.length,
        lastSynced: new Date().toLocaleTimeString(),
        error: null
      }));
    } catch (err: any) {
      console.error('Error syncing Supabase clients:', err);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message || 'Error connecting to fss_client table'
      }));
    }
  }, []);

  // Hydrate vendors from Supabase fss_vendor
  const loadSupabaseVendors = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
      let supabaseVendors = await SupabaseService.loadVendorsFromSupabase();

      // If fss_vendor is empty in Supabase, auto-seed with local active vendors
      if (supabaseVendors.length === 0 && Store.data?.parties) {
        const vendorParties = Store.data.parties.filter((p: any) => p.kind === 'vendor');
        if (vendorParties.length > 0) {
          console.log('fss_vendor table is empty in Supabase. Syncing existing vendors to Supabase...');
          await SupabaseService.syncLocalVendorsToSupabase(Store.data.parties);
          supabaseVendors = await SupabaseService.loadVendorsFromSupabase();
        }
      }

      if (supabaseVendors && Store.data?.parties) {
        supabaseVendors.forEach((sv: any) => {
          const partyRecord = convertFssVendorToParty(sv, sv.people);
          const existingIdx = Store.data.parties.findIndex(
            (p: any) => p.id === sv.id || (p.kind === 'vendor' && p.name.trim().toLowerCase() === sv.vendor_name.trim().toLowerCase())
          );
          if (existingIdx >= 0) {
            Store.data.parties[existingIdx] = { ...Store.data.parties[existingIdx], ...partyRecord };
          } else {
            Store.data.parties.unshift(partyRecord);
          }
        });
        Store.persist();
        render({ keepScroll: true });
      }

      setCloudStatus(prev => ({
        ...prev,
        connected: true,
        syncing: false,
        vendorCount: supabaseVendors.length,
        lastSynced: new Date().toLocaleTimeString(),
        error: null
      }));
    } catch (err: any) {
      console.error('Error syncing Supabase vendors:', err);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message || 'Error connecting to fss_vendor table'
      }));
    }
  }, []);

  // Hydrate employees from Supabase fss_employe
  const loadSupabaseEmployees = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
      let supabaseEmployees = await SupabaseService.loadEmployeesFromSupabase();

      // If fss_employe is empty in Supabase, auto-seed with local active employees
      if (supabaseEmployees.length === 0 && Store.data?.parties) {
        const empParties = Store.data.parties.filter((p: any) => p.kind === 'employee');
        if (empParties.length > 0) {
          console.log('fss_employe table is empty in Supabase. Syncing existing employees to Supabase...');
          await SupabaseService.syncLocalEmployeesToSupabase(Store.data.parties, Store.data.departments || []);
          supabaseEmployees = await SupabaseService.loadEmployeesFromSupabase();
        }
      }

      if (supabaseEmployees && Store.data?.parties) {
        supabaseEmployees.forEach((se: any) => {
          const partyRecord = convertFssEmployeToParty(se, Store.data.departments || []);
          const existingIdx = Store.data.parties.findIndex(
            (p: any) => (p.supabase_id && p.supabase_id === se.id) ||
                        (p.kind === 'employee' && p.name.trim().toLowerCase() === se.name.trim().toLowerCase())
          );
          if (existingIdx >= 0) {
            Store.data.parties[existingIdx] = {
              ...Store.data.parties[existingIdx],
              ...partyRecord,
              id: Store.data.parties[existingIdx].id // preserve existing id (e.g. em_aditya) for linked entries
            };
          } else {
            Store.data.parties.unshift(partyRecord);
          }
        });
        Store.persist();
        render({ keepScroll: true });
      }

      setCloudStatus(prev => ({
        ...prev,
        connected: true,
        syncing: false,
        employeeCount: supabaseEmployees.length,
        lastSynced: new Date().toLocaleTimeString(),
        error: null
      }));
    } catch (err: any) {
      console.error('Error syncing Supabase employees:', err);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message || 'Error connecting to fss_employe table'
      }));
    }
  }, []);

  // Hydrate other parties from Supabase fss_other_parties
  const loadSupabaseOtherParties = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
      let supabaseOtherParties = await SupabaseService.loadOtherPartiesFromSupabase();

      // If fss_other_parties is empty in Supabase, auto-seed with local active other parties
      if (supabaseOtherParties.length === 0 && Store.data?.parties) {
        const otherParties = Store.data.parties.filter((p: any) => p.kind === 'other');
        if (otherParties.length > 0) {
          console.log('fss_other_parties table is empty in Supabase. Syncing existing other parties to Supabase...');
          await SupabaseService.syncLocalOtherPartiesToSupabase(Store.data.parties);
          supabaseOtherParties = await SupabaseService.loadOtherPartiesFromSupabase();
        }
      }

      if (supabaseOtherParties && Store.data?.parties) {
        supabaseOtherParties.forEach((sop: any) => {
          const partyRecord = convertFssOtherPartyToParty(sop);
          const existingIdx = Store.data.parties.findIndex(
            (p: any) => (p.supabase_id && p.supabase_id === sop.id) ||
                        (p.kind === 'other' && p.name.trim().toLowerCase() === sop.name.trim().toLowerCase())
          );
          if (existingIdx >= 0) {
            Store.data.parties[existingIdx] = {
              ...Store.data.parties[existingIdx],
              ...partyRecord,
              id: Store.data.parties[existingIdx].id // preserve existing id (e.g. ot_hdfc) for linked entries
            };
          } else {
            Store.data.parties.unshift(partyRecord);
          }
        });
        Store.persist();
        render({ keepScroll: true });
      }

      setCloudStatus(prev => ({
        ...prev,
        connected: true,
        syncing: false,
        otherPartyCount: supabaseOtherParties.length,
        lastSynced: new Date().toLocaleTimeString(),
        error: null
      }));
    } catch (err: any) {
      console.error('Error syncing Supabase other parties:', err);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message || 'Error connecting to fss_other_parties table'
      }));
    }
  }, []);

  // Hydrate projects from Supabase fss_projects
  const loadSupabaseProjects = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
      let supabaseProjects = await SupabaseService.loadProjectsFromSupabase();

      // If fss_projects is empty in Supabase, auto-seed with local active projects
      if (supabaseProjects.length === 0 && Store.data?.projects) {
        const validProjects = Store.data.projects.filter((p: any) => (p.code || p.project_code) && (p.name || p.project_name));
        if (validProjects.length > 0) {
          console.log('fss_projects table is empty in Supabase. Syncing existing projects to Supabase...');
          await SupabaseService.syncLocalProjectsToSupabase(Store.data.projects, Store.data.parties || [], Store.data.departments || []);
          supabaseProjects = await SupabaseService.loadProjectsFromSupabase();
        }
      }

      if (supabaseProjects && Store.data?.projects) {
        supabaseProjects.forEach((sp: any) => {
          const projRecord = convertFssProjectToLocal(sp, Store.data.parties || [], Store.data.departments || []);
          const existingIdx = Store.data.projects.findIndex(
            (p: any) => (p.supabase_id && p.supabase_id === sp.id) ||
                        (p.code && p.code.trim().toLowerCase() === sp.project_code.trim().toLowerCase())
          );
          if (existingIdx >= 0) {
            Store.data.projects[existingIdx] = {
              ...Store.data.projects[existingIdx],
              ...projRecord,
              id: Store.data.projects[existingIdx].id // preserve local id (e.g. pr_2501)
            };
          } else {
            Store.data.projects.unshift(projRecord);
          }
        });
        Store.persist();
        render({ keepScroll: true });
      }

      setCloudStatus(prev => ({
        ...prev,
        connected: true,
        syncing: false,
        projectCount: supabaseProjects.length,
        lastSynced: new Date().toLocaleTimeString(),
        error: null
      }));
    } catch (err: any) {
      console.error('Error syncing Supabase projects:', err);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message || 'Error connecting to fss_projects table'
      }));
    }
  }, []);

  // Hydrate departments from Supabase fss_departments
  const loadSupabaseDepartments = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
      let supabaseDepts = await SupabaseService.loadDepartmentsFromSupabase();

      // If fss_departments is empty in Supabase, auto-seed with local active departments
      if (supabaseDepts.length === 0 && Store.data?.departments) {
        const validDepts = Store.data.departments.filter((d: any) => d.name);
        if (validDepts.length > 0) {
          console.log('fss_departments table is empty in Supabase. Syncing existing departments to Supabase...');
          await SupabaseService.syncLocalDepartmentsToSupabase(Store.data.departments);
          supabaseDepts = await SupabaseService.loadDepartmentsFromSupabase();
        }
      }

      if (supabaseDepts && Store.data?.departments) {
        supabaseDepts.forEach((sd: any) => {
          const deptRecord = convertFssDepartmentToLocal(sd);
          const existingIdx = Store.data.departments.findIndex(
            (d: any) => (d.supabase_id && d.supabase_id === sd.id) ||
                        (d.name && d.name.trim().toLowerCase() === sd.department_name.trim().toLowerCase())
          );
          if (existingIdx >= 0) {
            Store.data.departments[existingIdx] = {
              ...Store.data.departments[existingIdx],
              ...deptRecord,
              id: Store.data.departments[existingIdx].id // preserve local id (e.g. dep_design)
            };
          } else {
            Store.data.departments.push(deptRecord);
          }
        });
        Store.persist();
        render({ keepScroll: true });
      }

      setCloudStatus(prev => ({
        ...prev,
        connected: true,
        syncing: false,
        departmentCount: supabaseDepts.length,
        lastSynced: new Date().toLocaleTimeString(),
        error: null
      }));
    } catch (err: any) {
      console.error('Error syncing Supabase departments:', err);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message || 'Error connecting to fss_departments table'
      }));
    }
  }, []);

  // Hydrate bank accounts from Supabase fss_bank_accounts
  const loadSupabaseBankAccounts = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
      let supabaseAccounts = await SupabaseService.loadBankAccountsFromSupabase();

      // If fss_bank_accounts is empty in Supabase, auto-seed with local active accounts
      if (supabaseAccounts.length === 0 && Store.data?.accounts) {
        const validAccounts = Store.data.accounts.filter((a: any) => a.name);
        if (validAccounts.length > 0) {
          console.log('fss_bank_accounts table is empty in Supabase. Syncing existing bank accounts to Supabase...');
          await SupabaseService.syncLocalBankAccountsToSupabase(Store.data.accounts);
          supabaseAccounts = await SupabaseService.loadBankAccountsFromSupabase();
        }
      }

      if (supabaseAccounts && Store.data?.accounts) {
        supabaseAccounts.forEach((sa: any) => {
          const accRecord = convertFssBankAccountToLocal(sa);
          const existingIdx = Store.data.accounts.findIndex(
            (a: any) => (a.supabase_id && a.supabase_id === sa.id) ||
                        (a.name && a.name.trim().toLowerCase() === sa.account_name.trim().toLowerCase())
          );
          if (existingIdx >= 0) {
            Store.data.accounts[existingIdx] = {
              ...Store.data.accounts[existingIdx],
              ...accRecord,
              id: Store.data.accounts[existingIdx].id // preserve local id (e.g. acc_hdfc)
            };
          } else {
            Store.data.accounts.push(accRecord);
          }
        });
        Store.persist();
        render({ keepScroll: true });
      }

      setCloudStatus(prev => ({
        ...prev,
        connected: true,
        syncing: false,
        bankAccountCount: supabaseAccounts.length,
        lastSynced: new Date().toLocaleTimeString(),
        error: null
      }));
    } catch (err: any) {
      console.error('Error syncing Supabase bank accounts:', err);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message || 'Error connecting to fss_bank_accounts table'
      }));
    }
  }, []);

  // Hydrate categories from Supabase fss_categories
  const loadSupabaseCategories = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
      await SupabaseService.loadCategoryLookups();
      let supabaseCategories = await SupabaseService.loadCategoriesFromSupabase();

      // If fss_categories is empty in Supabase, auto-seed with local active categories
      if (supabaseCategories.length === 0 && Store.data?.categories) {
        const validCategories = Store.data.categories.filter((c: any) => c.name);
        if (validCategories.length > 0) {
          console.log('fss_categories table is empty in Supabase. Syncing existing categories to Supabase...');
          await SupabaseService.syncLocalCategoriesToSupabase(Store.data.categories);
          supabaseCategories = await SupabaseService.loadCategoriesFromSupabase();
        }
      }

      if (supabaseCategories && Store.data?.categories) {
        supabaseCategories.forEach((sc: any) => {
          const catRecord = convertFssCategoryToLocal(sc, Store.data.categories);
          const existingIdx = Store.data.categories.findIndex(
            (c: any) => (c.supabase_id && c.supabase_id === sc.id) ||
                        (c.name && c.name.trim().toLowerCase() === (sc.category_name || '').trim().toLowerCase())
          );
          if (existingIdx >= 0) {
            Store.data.categories[existingIdx] = {
              ...Store.data.categories[existingIdx],
              ...catRecord,
              id: Store.data.categories[existingIdx].id // preserve existing local id (e.g. cat_sal)
            };
          } else {
            Store.data.categories.push(catRecord);
          }
        });
        Store.persist();
        render({ keepScroll: true });
      }

      setCloudStatus(prev => ({
        ...prev,
        connected: true,
        syncing: false,
        categoryCount: supabaseCategories.length,
        lastSynced: new Date().toLocaleTimeString(),
        error: null
      }));
    } catch (err: any) {
      console.error('Error syncing Supabase categories:', err);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message || 'Error connecting to fss_categories table'
      }));
    }
  }, []);

  // Hydrate orders from Supabase fss_table_orders
  const loadSupabaseOrders = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
      let supabaseOrders = await SupabaseService.loadOrdersFromSupabase();

      // If fss_table_orders is empty in Supabase, auto-seed with local active orders
      if (supabaseOrders.length === 0 && Store.data?.orders) {
        const validOrders = Store.data.orders.filter((o: any) => o.orderNo && !o.deleted);
        if (validOrders.length > 0) {
          console.log('fss_table_orders table is empty in Supabase. Syncing existing orders to Supabase...');
          await SupabaseService.syncLocalOrdersToSupabase(
            Store.data.orders,
            Store.data.parties || [],
            Store.data.projects || [],
            Store.data.departments || []
          );
          supabaseOrders = await SupabaseService.loadOrdersFromSupabase();
        }
      }

      if (supabaseOrders && Store.data?.orders) {
        supabaseOrders.forEach((so: any) => {
          const ordRecord = convertFssOrderToLocal(
            so,
            Store.data.orders,
            Store.data.parties || [],
            Store.data.projects || [],
            Store.data.departments || []
          );
          const ordNum = (so.po_number || so.order_number || '').trim().toLowerCase();
          const existingIdx = Store.data.orders.findIndex(
            (o: any) => (o.supabase_id && o.supabase_id === so.id) ||
                        (o.orderNo && o.orderNo.trim().toLowerCase() === ordNum)
          );
          if (existingIdx >= 0) {
            Store.data.orders[existingIdx] = {
              ...Store.data.orders[existingIdx],
              ...ordRecord,
              id: Store.data.orders[existingIdx].id // preserve local id (e.g. ord_1)
            };
          } else {
            Store.data.orders.unshift(ordRecord);
          }
        });
        Store.persist();
        render({ keepScroll: true });
      }

      setCloudStatus(prev => ({
        ...prev,
        connected: true,
        syncing: false,
        orderCount: supabaseOrders.length,
        lastSynced: new Date().toLocaleTimeString(),
        error: null
      }));
    } catch (err: any) {
      console.error('Error syncing Supabase orders:', err);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message || 'Error connecting to fss_table_orders table'
      }));
    }
  }, []);

  // Hydrate transactions from Supabase fss_table_transactions
  const loadSupabaseTransactions = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
      let supabaseTransactions = await SupabaseService.loadTransactionsFromSupabase();

      // If fss_table_transactions is empty in Supabase, auto-seed with local active entries
      if (supabaseTransactions.length === 0 && Store.data?.entries) {
        const validEntries = Store.data.entries.filter((e: any) => e.date && !e.deleted && e.type !== 'transfer');
        if (validEntries.length > 0) {
          console.log('fss_table_transactions table is empty in Supabase. Syncing existing entries to Supabase...');
          await SupabaseService.syncLocalTransactionsToSupabase(
            Store.data.entries,
            Store.data.parties || [],
            Store.data.projects || [],
            Store.data.departments || [],
            Store.data.categories || [],
            Store.data.accounts || []
          );
          supabaseTransactions = await SupabaseService.loadTransactionsFromSupabase();
        }
      }

      if (supabaseTransactions && Store.data?.entries) {
        supabaseTransactions.forEach((st: any) => {
          const entryRecord = convertFssTransactionToLocal(
            st,
            Store.data.entries,
            Store.data.parties || [],
            Store.data.projects || [],
            Store.data.departments || [],
            Store.data.categories || [],
            Store.data.accounts || []
          );
          const existingIdx = Store.data.entries.findIndex(
            (e: any) => (e.supabase_id && e.supabase_id === st.id) ||
                        (st.reference_number && e.refNo && e.refNo.trim().toLowerCase() === st.reference_number.trim().toLowerCase())
          );
          if (existingIdx >= 0) {
            Store.data.entries[existingIdx] = {
              ...Store.data.entries[existingIdx],
              ...entryRecord,
              id: Store.data.entries[existingIdx].id // preserve local id
            };
          } else {
            Store.data.entries.unshift(entryRecord);
          }
        });
        Store.persist();
        render({ keepScroll: true });
      }

      setCloudStatus(prev => ({
        ...prev,
        connected: true,
        syncing: false,
        transactionCount: supabaseTransactions.length,
        lastSynced: new Date().toLocaleTimeString(),
        error: null
      }));
    } catch (err: any) {
      console.error('Error syncing Supabase transactions:', err);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message || 'Error connecting to fss_table_transactions table'
      }));
    }
  }, []);

  // Hydrate Cashflow Inflow from Supabase (fss_operation_receipts, fss_income, fss_financing, fss_cash_inflow, fss_outflow_oc_people)
  const loadSupabaseCashflowTables = useCallback(async (opts?: { skipAutoSeed?: boolean }) => {
    if (!isSupabaseConfigured) return;
    try {
      setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
      let [result, peopleRows, peopleReport, projectCostRows, capexRows, financingAndOwnerRows, officeFixedRows, officeVariableRows, travelRows, professionalAdminRows, taxStatutoryRows] = await Promise.all([
        SupabaseService.loadAllCashflowInflowFromSupabase(),
        SupabaseService.loadPeopleFromSupabase(),
        SupabaseService.loadPeopleReportFromSupabase(),
        SupabaseService.loadProjectCostFromSupabase(),
        SupabaseService.loadCapexFromSupabase(),
        SupabaseService.loadFinancingAndOwnerFromSupabase(),
        SupabaseService.loadOfficeFixedFromSupabase(),
        SupabaseService.loadOfficeVariableFromSupabase(),
        SupabaseService.loadTravelFromSupabase(),
        SupabaseService.loadProfessionalAdminFromSupabase(),
        SupabaseService.loadTaxStatutoryFromSupabase()
      ]);

      // If tables are empty in Supabase, auto-seed with computed local UI cashflow
      const currentFy = (typeof S !== 'undefined' && S.fy) ? S.fy : 2026;
      if (
        result.operationReceipts.length === 0 &&
        result.income.length === 0 &&
        result.financing.length === 0 &&
        Store.data?.entries
      ) {
        console.log('Cashflow tables empty in Supabase. Auto-syncing initial UI cashflow to Supabase...');
        const computed = computeCashflowInflowRows(Store.data.entries, currentFy);
        if (computed) {
          result = await SupabaseService.syncCashflowInflowToSupabase({
            operationReceipts: computed.operationReceiptsRows,
            income: computed.incomeRows,
            financing: computed.financingRows
          });
        }
      }

      let finalPeopleRows = peopleRows;
      let finalPeopleReport = peopleReport;
      let finalProjectCostRows = projectCostRows;
      let finalCapexRows = capexRows;
      let finalFinancingAndOwnerRows = financingAndOwnerRows;
      let finalOfficeFixedRows = officeFixedRows;
      let finalOfficeVariableRows = officeVariableRows;
      let finalTravelRows = travelRows;
      let finalProfessionalAdminRows = professionalAdminRows;
      let finalTaxStatutoryRows = taxStatutoryRows;
      if (finalPeopleRows.length === 0 && Store.data?.entries) {
        const computedPeople = computeCashflowPeopleRows(Store.data.entries, currentFy);
        if (computedPeople) {
          const syncRes = await SupabaseService.syncPeopleToSupabase(computedPeople);
          finalPeopleRows = syncRes.people;
          finalPeopleReport = syncRes.peopleReport;
        }
      }
      const needsProjectCostSeed = !opts?.skipAutoSeed && finalProjectCostRows.length === 0;
      if (needsProjectCostSeed && Store.data?.entries) {
        const computedProjectCost = computeCashflowOutflowProjectCostRows(Store.data.entries, currentFy);
        if (computedProjectCost) {
          const syncRes = await SupabaseService.syncProjectCostToSupabase(computedProjectCost.rows);
          finalProjectCostRows = syncRes.projectCost;
        }
      }
      const allCapexNull = finalCapexRows.length > 0 && finalCapexRows.every((r: any) => ['jan_26','feb_26','mar_26','apr_26','may_26','jun_26','jul_26','aug_26','sep_26','oct_26','nov_26','dec_26'].every((m: string) => r[m] == null));
      if ((finalCapexRows.length === 0 || allCapexNull) && Store.data?.entries) {
        const computedCapex = computeCashflowOutflowCapexRows(Store.data.entries, currentFy);
        if (computedCapex) {
          const syncRes = await SupabaseService.syncCapexToSupabase(computedCapex.rows);
          finalCapexRows = syncRes.capex;
        }
      }
      const allFinancingOwnerNull = finalFinancingAndOwnerRows.length > 0 && finalFinancingAndOwnerRows.every((r: any) => ['jan_26','feb_26','mar_26','apr_26','may_26','jun_26','jul_26','aug_26','sep_26','oct_26','nov_26','dec_26'].every((m: string) => r[m] == null));
      if ((finalFinancingAndOwnerRows.length === 0 || allFinancingOwnerNull) && Store.data?.entries) {
        const computedFinancingAndOwner = computeCashflowOutflowFinancingAndOwnerRows(Store.data.entries, currentFy);
        if (computedFinancingAndOwner) {
          const syncRes = await SupabaseService.syncFinancingAndOwnerToSupabase(computedFinancingAndOwner.rows);
          finalFinancingAndOwnerRows = syncRes.financingAndOwner;
        }
      }
      const allOfficeFixedNull = finalOfficeFixedRows.length > 0 && finalOfficeFixedRows.every((r: any) => ['jan26','feb26','mar26','apr26','may26','jun26','july26','aug26','sept26','oct26','nov26','dec26'].every((m: string) => r[m] == null));
      if ((finalOfficeFixedRows.length === 0 || allOfficeFixedNull) && Store.data?.entries) {
        const computedOfficeFixed = computeCashflowOutflowOfficeFixedRows(Store.data.entries, currentFy);
        if (computedOfficeFixed) {
          const syncRes = await SupabaseService.syncOfficeFixedToSupabase(computedOfficeFixed.rows);
          finalOfficeFixedRows = syncRes.officeFixed;
        }
      }
      const allOfficeVariableNull = finalOfficeVariableRows.length > 0 && finalOfficeVariableRows.every((r: any) => ['jan26','feb26','mar26','apr26','may26','jun26','july26','aug26','sept26','oct26','nov26','dec26'].every((m: string) => r[m] == null));
      if ((finalOfficeVariableRows.length === 0 || allOfficeVariableNull) && Store.data?.entries) {
        const computedOfficeVariable = computeCashflowOutflowOfficeVariableRows(Store.data.entries, currentFy);
        if (computedOfficeVariable) {
          const syncRes = await SupabaseService.syncOfficeVariableToSupabase(computedOfficeVariable.rows);
          finalOfficeVariableRows = syncRes.officeVariable;
        }
      }
      const allTravelNull = finalTravelRows.length > 0 && finalTravelRows.every((r: any) => ['jan26','feb26','mar26','apr26','may26','jun26','july26','aug26','sept26','oct26','nov26','dec26'].every((m: string) => r[m] == null));
      if ((finalTravelRows.length === 0 || allTravelNull) && Store.data?.entries) {
        const computedTravel = computeCashflowOutflowTravelRows(Store.data.entries, currentFy);
        if (computedTravel) {
          const syncRes = await SupabaseService.syncTravelToSupabase(computedTravel.rows);
          finalTravelRows = syncRes.travel;
        }
      }
      const allProfessionalAdminNull = finalProfessionalAdminRows.length > 0 && finalProfessionalAdminRows.every((r: any) => ['jan26','feb26','mar26','apr26','may26','jun26','july26','aug26','sept26','oct26','nov26','dec26'].every((m: string) => r[m] == null));
      const needsProfessionalAdminSeed = !opts?.skipAutoSeed && (finalProfessionalAdminRows.length === 0 || allProfessionalAdminNull);
      if (needsProfessionalAdminSeed && Store.data?.entries) {
        const computedProfessionalAdmin = computeCashflowOutflowProfessionalAdminRows(Store.data.entries, currentFy);
        if (computedProfessionalAdmin) {
          const syncRes = await SupabaseService.syncProfessionalAdminToSupabase(computedProfessionalAdmin.rows);
          finalProfessionalAdminRows = syncRes.professionalAdmin;
        }
      }
      const allTaxStatutoryNull = finalTaxStatutoryRows.length > 0 && finalTaxStatutoryRows.every((r: any) => ['jan_26','feb_26','mar_26','apr_26','may_26','jun_26','jul_26','aug_26','sep_26','oct_26','nov_26','dec_26'].every((m: string) => r[m] == null));
      const needsTaxStatutorySeed = !opts?.skipAutoSeed && (finalTaxStatutoryRows.length === 0 || allTaxStatutoryNull);
      if (needsTaxStatutorySeed && Store.data?.entries) {
        const computedTaxStatutory = computeCashflowOutflowTaxStatutoryRows(Store.data.entries, currentFy);
        if (computedTaxStatutory) {
          const syncRes = await SupabaseService.syncTaxStatutoryToSupabase(computedTaxStatutory.rows);
          finalTaxStatutoryRows = syncRes.taxStatutory;
        }
      }

      if (Store.data) {
        Store.data.fss_operation_receipts = result.operationReceipts;
        Store.data.fss_income = result.income;
        Store.data.fss_financing = result.financing;
        Store.data.fss_cash_inflow = result.cashInflow;
        Store.data.fss_outflow_oc_people = finalPeopleRows;
        Store.data.fss_outflow_oc_people_report = finalPeopleReport;
        Store.data.fss_outflow_project_cost = finalProjectCostRows;
        Store.data.fss_outflow_capex = finalCapexRows;
        Store.data.fss_outflow_financing_and_owner = finalFinancingAndOwnerRows;
        Store.data.fss_outflow_oc_office_fixed = finalOfficeFixedRows;
        Store.data.fss_outflow_oc_office_variable = finalOfficeVariableRows;
        Store.data.fss_outflow_oc_travel = finalTravelRows;
        Store.data.fss_outflow_oc_professional_admin = finalProfessionalAdminRows;
        Store.data.fss_outflow_tax_statutory = finalTaxStatutoryRows;

        // Auto-heal if Supabase ever differs from UI (e.g. outdated fy_to_date, share, or jan_26 > 0)
        const computed = Store.data?.entries
          ? computeCashflowInflowRows(Store.data.entries, currentFy)
          : null;

        const hasDiscrepancy = computed && (
          (result.operationReceipts || []).some((r: any) => {
            const compRow = (computed.operationReceiptsRows as any[])?.find((c: any) => c.id === r.id);
            return compRow && (
              Number(r.fy_to_date) !== Number(compRow.fy_to_date) ||
              Math.abs(Number(r.share) - Number(compRow.share)) > 0.05 ||
              Number(r.jan_26) > 0 ||
              Number(r.oct_26) !== Number(compRow.oct_26)
            );
          }) ||
          (result.income || []).some((r: any) => {
            const compRow = (computed.incomeRows as any[])?.find((c: any) => c.id === r.id);
            return compRow && (
              Number(r.fy_to_date) !== Number(compRow.fy_to_date) ||
              Math.abs(Number(r.share) - Number(compRow.share)) > 0.05 ||
              Number(r.oct_26) !== Number(compRow.oct_26)
            );
          }) ||
          (result.financing || []).some((r: any) => {
            const compRow = (computed.financingRows as any[])?.find((c: any) => c.id === r.id);
            return compRow && (
              Number(r.fy_to_date) !== Number(compRow.fy_to_date) ||
              Math.abs(Number(r.share) - Number(compRow.share)) > 0.05 ||
              Number(r.jan_26) > 0 ||
              Number(r.oct_26) !== Number(compRow.oct_26)
            );
          })
        );

        if (hasDiscrepancy && computed) {
          result = await SupabaseService.syncCashflowInflowToSupabase({
            operationReceipts: computed.operationReceiptsRows,
            income: computed.incomeRows,
            financing: computed.financingRows
          });
          Store.data.fss_operation_receipts = result.operationReceipts;
          Store.data.fss_income = result.income;
          Store.data.fss_financing = result.financing;
          Store.data.fss_cash_inflow = result.cashInflow;
        }

        const computedPeople = Store.data?.entries
          ? computeCashflowPeopleRows(Store.data.entries, currentFy)
          : null;
        const hasPeopleDiscrepancy = computedPeople && (
          (finalPeopleRows || []).some((r: any) => {
            const compRow = (computedPeople as any[])?.find((c: any) => c.id === r.id);
            return compRow && (
              Number(r.oct_26) !== Number(compRow.oct_26) ||
              Number(r.may_26) !== Number(compRow.may_26) ||
              Number(r.apr_26) !== Number(compRow.apr_26)
            );
          })
        );
        if (hasPeopleDiscrepancy && computedPeople) {
          const syncRes = await SupabaseService.syncPeopleToSupabase(computedPeople);
          finalPeopleRows = syncRes.people;
          finalPeopleReport = syncRes.peopleReport;
          Store.data.fss_outflow_oc_people = finalPeopleRows;
          Store.data.fss_outflow_oc_people_report = finalPeopleReport;
        }

        render({ keepScroll: true });
      }

      setCloudStatus(prev => ({
        ...prev,
        connected: true,
        syncing: false,
        operationReceiptCount: result.operationReceipts.length,
        incomeCount: result.income.length,
        financingCount: result.financing.length,
        cashInflowCount: result.cashInflow.length,
        peopleCount: finalPeopleRows.length,
        projectCostCount: finalProjectCostRows.length,
        capexCount: finalCapexRows.length,
        lastSynced: new Date().toLocaleTimeString(),
        error: null
      }));
      return result;
    } catch (err: any) {
      console.error('Error syncing Supabase cashflow tables:', err);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        error: err.message || 'Error connecting to cashflow tables in Supabase'
      }));
    }
  }, []);

  // Refresh all entities from Supabase
  const refreshAllFromSupabase = useCallback(async () => {
    await Promise.all([
      loadSupabaseClients(),
      loadSupabaseVendors(),
      loadSupabaseEmployees(),
      loadSupabaseOtherParties(),
      loadSupabaseProjects(),
      loadSupabaseDepartments(),
      loadSupabaseBankAccounts(),
      loadSupabaseCategories(),
      loadSupabaseOrders(),
      loadSupabaseTransactions(),
      loadSupabaseCashflowTables()
    ]);
  }, [loadSupabaseClients, loadSupabaseVendors, loadSupabaseEmployees, loadSupabaseOtherParties, loadSupabaseProjects, loadSupabaseDepartments, loadSupabaseBankAccounts, loadSupabaseCategories, loadSupabaseOrders, loadSupabaseTransactions, loadSupabaseCashflowTables]);

  // Initialize Core Application and Supabase
  useEffect(() => {
    let mounted = true;
    let cashflowDebounceTimer: any = null;
    // Set when a Supabase-backed Cashflow write (e.g. Project Costs cell update) has just been applied,
    // so the auto re-sync from local entries does not overwrite the freshly saved Supabase value.
    let cashflowSyncSuppress = false;

    const init = async () => {
      // 1. Boot original application engine
      try {
        boot();
        (window as any).Store = Store;
        (window as any).api = api;
      } catch (err) {
        console.error('Error during boot:', err);
      }

      // 2. Register global Supabase client saver for the core UI form
      (window as any).__supabaseSaveClient = async (companyData: any, peopleArray: any[], taxData: any) => {
        if (!isSupabaseConfigured) {
          console.warn('Supabase is not configured yet in .env; saving in local offline mode.');
          return null;
        }
        const res = await SupabaseService.saveClient(companyData, peopleArray, taxData);
        if (res?.client) {
          setCloudStatus(prev => ({
            ...prev,
            clientCount: (prev.clientCount || 0) + 1,
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return res;
      };

      (window as any).__supabaseDeleteClient = async (clientId: string) => {
        if (!isSupabaseConfigured) return false;
        const ok = await SupabaseService.deleteClient(clientId);
        if (ok) {
          setCloudStatus(prev => ({
            ...prev,
            clientCount: Math.max(0, (prev.clientCount || 1) - 1),
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return ok;
      };

      // 3. Register global Supabase vendor saver for the core UI form
      (window as any).__supabaseSaveVendor = async (vendorData: any, peopleArray: any[], taxBankData: any) => {
        if (!isSupabaseConfigured) {
          console.warn('Supabase is not configured yet in .env; saving in local offline mode.');
          return null;
        }
        const res = await SupabaseService.saveVendor(vendorData, peopleArray, taxBankData);
        if (res?.vendor) {
          setCloudStatus(prev => ({
            ...prev,
            vendorCount: (prev.vendorCount || 0) + 1,
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return res;
      };

      (window as any).__supabaseDeleteVendor = async (vendorId: string) => {
        if (!isSupabaseConfigured) return false;
        const ok = await SupabaseService.deleteVendor(vendorId);
        if (ok) {
          setCloudStatus(prev => ({
            ...prev,
            vendorCount: Math.max(0, (prev.vendorCount || 1) - 1),
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return ok;
      };

      // 4. Register global Supabase employee saver for the core UI form
      (window as any).__supabaseSaveEmployee = async (empData: any) => {
        if (!isSupabaseConfigured) {
          console.warn('Supabase is not configured yet in .env; saving in local offline mode.');
          return null;
        }
        const res = await SupabaseService.saveEmployee(empData);
        if (res) {
          setCloudStatus(prev => ({
            ...prev,
            employeeCount: (prev.employeeCount || 0) + 1,
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return res;
      };

      (window as any).__supabaseDeleteEmployee = async (empId: string | number) => {
        if (!isSupabaseConfigured) return false;
        const ok = await SupabaseService.deleteEmployee(empId);
        if (ok) {
          setCloudStatus(prev => ({
            ...prev,
            employeeCount: Math.max(0, (prev.employeeCount || 1) - 1),
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return ok;
      };

      // 5. Register global Supabase other party saver for the core UI form
      (window as any).__supabaseSaveOtherParty = async (partyData: any) => {
        if (!isSupabaseConfigured) {
          console.warn('Supabase is not configured yet in .env; saving in local offline mode.');
          return null;
        }
        const res = await SupabaseService.saveOtherParty(partyData);
        if (res) {
          setCloudStatus(prev => ({
            ...prev,
            otherPartyCount: (prev.otherPartyCount || 0) + 1,
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return res;
      };

      (window as any).__supabaseDeleteOtherParty = async (partyId: string | number) => {
        if (!isSupabaseConfigured) return false;
        const ok = await SupabaseService.deleteOtherParty(partyId);
        if (ok) {
          setCloudStatus(prev => ({
            ...prev,
            otherPartyCount: Math.max(0, (prev.otherPartyCount || 1) - 1),
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return ok;
      };

      // 6. Register global Supabase project saver for the core UI form
      (window as any).__supabaseSaveProject = async (projectData: any) => {
        if (!isSupabaseConfigured) {
          console.warn('Supabase is not configured yet in .env; saving in local offline mode.');
          return null;
        }
        const res = await SupabaseService.saveProject(projectData, Store.data?.parties || []);
        if (res) {
          setCloudStatus(prev => ({
            ...prev,
            projectCount: (prev.projectCount || 0) + 1,
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return res;
      };

      (window as any).__supabaseDeleteProject = async (projectIdOrCode: string | number) => {
        if (!isSupabaseConfigured) return false;
        const ok = await SupabaseService.deleteProject(projectIdOrCode);
        if (ok) {
          setCloudStatus(prev => ({
            ...prev,
            projectCount: Math.max(0, (prev.projectCount || 1) - 1),
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return ok;
      };

      // 7. Register global Supabase department saver for the core UI form
      (window as any).__supabaseSaveDepartment = async (deptData: any) => {
        if (!isSupabaseConfigured) {
          console.warn('Supabase is not configured yet in .env; saving in local offline mode.');
          return null;
        }
        const res = await SupabaseService.saveDepartment(deptData);
        if (res) {
          setCloudStatus(prev => ({
            ...prev,
            departmentCount: (prev.departmentCount || 0) + 1,
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return res;
      };

      (window as any).__supabaseDeleteDepartment = async (departmentIdOrName: string | number) => {
        if (!isSupabaseConfigured) return false;
        const ok = await SupabaseService.deleteDepartment(departmentIdOrName);
        if (ok) {
          setCloudStatus(prev => ({
            ...prev,
            departmentCount: Math.max(0, (prev.departmentCount || 1) - 1),
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return ok;
      };

      // 8. Register global Supabase bank account saver for the core UI form
      (window as any).__supabaseSaveBankAccount = async (accData: any) => {
        if (!isSupabaseConfigured) {
          console.warn('Supabase is not configured yet in .env; saving in local offline mode.');
          return null;
        }
        const res = await SupabaseService.saveBankAccount(accData);
        if (res) {
          setCloudStatus(prev => ({
            ...prev,
            bankAccountCount: (prev.bankAccountCount || 0) + 1,
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return res;
      };

      (window as any).__supabaseDeleteBankAccount = async (accountIdOrName: string | number) => {
        if (!isSupabaseConfigured) return false;
        const ok = await SupabaseService.deleteBankAccount(accountIdOrName);
        if (ok) {
          setCloudStatus(prev => ({
            ...prev,
            bankAccountCount: Math.max(0, (prev.bankAccountCount || 1) - 1),
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return ok;
      };

      // 9. Register global Supabase category saver for the core UI form
      (window as any).__supabaseSaveCategory = async (catData: any) => {
        if (!isSupabaseConfigured) {
          console.warn('Supabase is not configured yet in .env; saving in local offline mode.');
          return null;
        }
        const res = await SupabaseService.saveCategory(catData);
        if (res) {
          setCloudStatus(prev => ({
            ...prev,
            categoryCount: (prev.categoryCount || 0) + 1,
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return res;
      };

      (window as any).__supabaseDeleteCategory = async (categoryIdOrName: string | number) => {
        if (!isSupabaseConfigured) return false;
        const ok = await SupabaseService.deleteCategory(categoryIdOrName);
        if (ok) {
          setCloudStatus(prev => ({
            ...prev,
            categoryCount: Math.max(0, (prev.categoryCount || 1) - 1),
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return ok;
      };

      // 10. Register global Supabase order saver for the core UI form
      (window as any).__supabaseSaveOrder = async (orderData: any) => {
        if (!isSupabaseConfigured) {
          console.warn('Supabase is not configured yet in .env; saving in local offline mode.');
          return null;
        }
        const res = await SupabaseService.saveOrder(
          orderData,
          Store.data?.parties || [],
          Store.data?.projects || [],
          Store.data?.departments || []
        );
        if (res) {
          setCloudStatus(prev => ({
            ...prev,
            orderCount: (prev.orderCount || 0) + 1,
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return res;
      };

      (window as any).__supabaseDeleteOrder = async (orderIdOrNo: string | number) => {
        if (!isSupabaseConfigured) return false;
        const ok = await SupabaseService.deleteOrder(orderIdOrNo);
        if (ok) {
          setCloudStatus(prev => ({
            ...prev,
            orderCount: Math.max(0, (prev.orderCount || 1) - 1),
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        return ok;
      };

      // 11. Register Supabase Cashflow Inflow Sync and Fetch handlers
      let isSyncingCashflow = false;
      let pendingSyncRequested = false;

      const doSyncCashflowInflow = async () => {
        if (!isSupabaseConfigured) return null;
        try {
          const currentFy = (typeof S !== 'undefined' && S.fy) ? S.fy : 2026;
          const entriesList = Store.data?.entries || [];
          const officeFixedComputed = computeCashflowOutflowOfficeFixedRows(entriesList, currentFy);
          const officeVariableComputed = computeCashflowOutflowOfficeVariableRows(entriesList, currentFy);
          if (officeFixedComputed && Store.data) {
            Store.data.fss_outflow_oc_office_fixed = officeFixedComputed.rows;
          }
          if (officeVariableComputed && Store.data) {
            Store.data.fss_outflow_oc_office_variable = officeVariableComputed.rows;
          }
          if ((officeFixedComputed || officeVariableComputed) && Store.data) {
            Store.persist();
            if (typeof render === 'function') {
              render({ keepScroll: true });
            }
          }
          const [officeFixedSynced, officeVariableSynced] = await Promise.all([
            officeFixedComputed
              ? SupabaseService.syncOfficeFixedToSupabase(officeFixedComputed.rows)
              : Promise.resolve(null),
            officeVariableComputed
              ? SupabaseService.syncOfficeVariableToSupabase(officeVariableComputed.rows)
              : Promise.resolve(null)
          ]);
          if (officeFixedSynced && Store.data) {
            Store.data.fss_outflow_oc_office_fixed = officeFixedSynced.officeFixed;
          }
          if (officeVariableSynced && Store.data) {
            Store.data.fss_outflow_oc_office_variable = officeVariableSynced.officeVariable;
          }

          const computed = computeCashflowInflowRows(entriesList, currentFy);
          if (!computed) return null;

          const payloads = {
            operationReceipts: computed.operationReceiptsRows,
            income: computed.incomeRows,
            financing: computed.financingRows
          };

          const peoplePayload = computeCashflowPeopleRows(entriesList, currentFy);
          const [synced, peopleSynced] = await Promise.all([
            SupabaseService.syncCashflowInflowToSupabase(payloads),
            SupabaseService.syncPeopleToSupabase(peoplePayload)
          ]);
          const projectCostComputed = computeCashflowOutflowProjectCostRows(entriesList, currentFy);
          const projectCostSynced = projectCostComputed
            ? await SupabaseService.syncProjectCostToSupabase(projectCostComputed.rows)
            : null;
          const capexComputed = computeCashflowOutflowCapexRows(entriesList, currentFy);
          const capexSynced = capexComputed
            ? await SupabaseService.syncCapexToSupabase(capexComputed.rows)
            : null;
          const financingAndOwnerComputed = computeCashflowOutflowFinancingAndOwnerRows(entriesList, currentFy);
          const financingAndOwnerSynced = financingAndOwnerComputed
            ? await SupabaseService.syncFinancingAndOwnerToSupabase(financingAndOwnerComputed.rows)
            : null;
          const travelComputed = computeCashflowOutflowTravelRows(entriesList, currentFy);
          const travelSynced = travelComputed
            ? await SupabaseService.syncTravelToSupabase(travelComputed.rows)
            : null;
          const professionalAdminComputed = computeCashflowOutflowProfessionalAdminRows(entriesList, currentFy);
          const professionalAdminSynced = professionalAdminComputed
            ? await SupabaseService.syncProfessionalAdminToSupabase(professionalAdminComputed.rows)
            : null;
          const taxStatutoryComputed = computeCashflowOutflowTaxStatutoryRows(entriesList, currentFy);
          const taxStatutorySynced = taxStatutoryComputed
            ? await SupabaseService.syncTaxStatutoryToSupabase(taxStatutoryComputed.rows)
            : null;
          if (Store.data) {
            Store.data.fss_operation_receipts = synced.operationReceipts;
            Store.data.fss_income = synced.income;
            Store.data.fss_financing = synced.financing;
            Store.data.fss_cash_inflow = synced.cashInflow;
            Store.data.fss_outflow_oc_people = peopleSynced.people;
            Store.data.fss_outflow_oc_people_report = peopleSynced.peopleReport;
            if (projectCostSynced) {
              Store.data.fss_outflow_project_cost = projectCostSynced.projectCost;
            }
            if (capexSynced) {
              Store.data.fss_outflow_capex = capexSynced.capex;
            }
            if (financingAndOwnerSynced) {
              Store.data.fss_outflow_financing_and_owner = financingAndOwnerSynced.financingAndOwner;
            }
            if (officeFixedSynced) {
              Store.data.fss_outflow_oc_office_fixed = officeFixedSynced.officeFixed;
            }
            if (officeVariableSynced) {
              Store.data.fss_outflow_oc_office_variable = officeVariableSynced.officeVariable;
            }
            if (travelSynced) {
              Store.data.fss_outflow_oc_travel = travelSynced.travel;
            }
            if (professionalAdminSynced) {
              Store.data.fss_outflow_oc_professional_admin = professionalAdminSynced.professionalAdmin;
            }
            if (taxStatutorySynced) {
              Store.data.fss_outflow_tax_statutory = taxStatutorySynced.taxStatutory;
            }
            // Suppress sync loop when updating local store with synced data
            isSyncingCashflow = true;
            try {
              Store.persist();
            } finally {
              isSyncingCashflow = false;
            }
            if (typeof render === 'function') {
              render({ keepScroll: true });
            }
          }
          setCloudStatus(prev => ({
            ...prev,
            operationReceiptCount: synced.operationReceipts.length,
            incomeCount: synced.income.length,
            financingCount: synced.financing.length,
            cashInflowCount: synced.cashInflow.length,
            peopleCount: peopleSynced.people.length,
            projectCostCount: projectCostSynced?.projectCost?.length ?? (Store.data?.fss_outflow_project_cost || []).length,
            lastSynced: new Date().toLocaleTimeString()
          }));
          return synced;
        } catch (err: any) {
          console.error('Error in doSyncCashflowInflow:', err);
          throw err;
        }
      };

      const triggerCashflowSync = async () => {
        if (!isSupabaseConfigured) return;
        if (isSyncingCashflow) {
          pendingSyncRequested = true;
          return;
        }
        try {
          isSyncingCashflow = true;
          pendingSyncRequested = false;
          await doSyncCashflowInflow();
        } catch (e) {
          console.warn('Cashflow sync to Supabase failed:', e);
        } finally {
          isSyncingCashflow = false;
          if (pendingSyncRequested) {
            pendingSyncRequested = false;
            setTimeout(() => triggerCashflowSync(), 150);
          }
        }
      };

      (window as any).__supabaseSyncCashflowInflow = triggerCashflowSync;

      (window as any).__onCashflowDataChanged = () => {
        if (!isSupabaseConfigured || isSyncingCashflow) return;
        if (cashflowSyncSuppress) {
          // A Supabase-backed Cashflow write just happened (e.g. Project Costs cell update).
          // Do not trigger the entries-derived re-sync, otherwise it overwrites the saved Supabase value.
          cashflowSyncSuppress = false;
          if (cashflowDebounceTimer) { clearTimeout(cashflowDebounceTimer); cashflowDebounceTimer = null; }
          return;
        }
        if (cashflowDebounceTimer) clearTimeout(cashflowDebounceTimer);
        cashflowDebounceTimer = setTimeout(() => {
          triggerCashflowSync();
        }, 200);
      };

      // 12. Register global Supabase transaction saver for the core UI form
      (window as any).__supabaseSaveTransaction = async (entryData: any) => {
        if (!isSupabaseConfigured) {
          console.warn('Supabase is not configured yet in .env; saving in local offline mode.');
          return null;
        }
        let res = null;
        try {
          res = await SupabaseService.saveTransaction(
            entryData,
            Store.data?.parties || [],
            Store.data?.projects || [],
            Store.data?.departments || [],
            Store.data?.categories || [],
            Store.data?.accounts || []
          );
          if (res) {
            setCloudStatus(prev => ({
              ...prev,
              transactionCount: (prev.transactionCount || 0) + 1,
              lastSynced: new Date().toLocaleTimeString()
            }));
          }
        } catch (e) {
          console.warn('saveTransaction error in fss_table_transactions:', e);
        }

        // ALWAYS sync cashflow inflow tables so Supabase fss_income, fss_operation_receipts, and fss_financing update immediately
        try {
          await triggerCashflowSync();
        } catch (e) {
          console.warn('Cashflow sync failed:', e);
        }

        return res;
      };

      (window as any).__supabaseCancelTransaction = async (idOrSupabaseId: string | number, entry?: any) => {
        if (!isSupabaseConfigured) return false;
        const res = await SupabaseService.cancelTransaction(idOrSupabaseId, entry);
        try {
          await triggerCashflowSync();
        } catch (e) {
          console.warn('Cashflow sync failed:', e);
        }
        return res;
      };

      (window as any).__supabaseDeleteTransaction = async (idOrSupabaseId: string | number, entry?: any) => {
        if (!isSupabaseConfigured) return false;
        const ok = await SupabaseService.deleteTransaction(idOrSupabaseId, entry);
        if (ok) {
          setCloudStatus(prev => ({
            ...prev,
            transactionCount: Math.max(0, (prev.transactionCount || 1) - 1),
            lastSynced: new Date().toLocaleTimeString()
          }));
        }
        try {
          await triggerCashflowSync();
        } catch (e) {
          console.warn('Cashflow sync failed:', e);
        }
        return ok;
      };

      (window as any).__supabaseFetchCashflowInflow = async () => {
        return loadSupabaseCashflowTables();
      };

      // Direct cell edit handler for Operating Receipts
      (window as any).__updateOperationReceiptCell = async (idOrName: number | string, monthCol: string, newValue: number | string) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.updateOperationReceiptCell(idOrName, monthCol, newValue);
          if (Store.data) {
            Store.data.fss_operation_receipts = res.allRows;
            Store.persist();
          }
          setCloudStatus(prev => ({
            ...prev,
            syncing: false,
            lastSynced: new Date().toLocaleTimeString(),
            error: null
          }));
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __updateOperationReceiptCell:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Add new Operating Receipt entry
      (window as any).__addOperationReceipt = async (receiptName: string, monthlyAmounts: Record<string, number> = {}) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.addOperationReceipt(receiptName, monthlyAmounts);
          await loadSupabaseCashflowTables();
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __addOperationReceipt:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Direct cell edit handler for Other Income
      (window as any).__updateIncomeCell = async (idOrName: number | string, monthCol: string, newValue: number | string) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.updateIncomeCell(idOrName, monthCol, newValue);
          if (Store.data) {
            Store.data.fss_income = res.allRows;
            Store.persist();
          }
          setCloudStatus(prev => ({
            ...prev,
            syncing: false,
            lastSynced: new Date().toLocaleTimeString(),
            error: null
          }));
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __updateIncomeCell:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Add new Other Income entry
      (window as any).__addIncome = async (incomeName: string, monthlyAmounts: Record<string, number> = {}) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.addIncome(incomeName, monthlyAmounts);
          await loadSupabaseCashflowTables();
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __addIncome:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Direct cell edit handler for Financing
      (window as any).__updateFinancingCell = async (idOrName: number | string, monthCol: string, newValue: number | string) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.updateFinancingCell(idOrName, monthCol, newValue);
          if (Store.data) {
            Store.data.fss_financing = res.allRows;
            Store.persist();
          }
          setCloudStatus(prev => ({
            ...prev,
            syncing: false,
            lastSynced: new Date().toLocaleTimeString(),
            error: null
          }));
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __updateFinancingCell:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Add new Financing entry
      (window as any).__addFinancing = async (financingName: string, monthlyAmounts: Record<string, number> = {}) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.addFinancing(financingName, monthlyAmounts);
          await loadSupabaseCashflowTables();
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __addFinancing:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Direct cell edit handler for People Outflow (fss_outflow_oc_people)
      (window as any).__updatePeopleCell = async (idOrCategory: number | string, monthCol: string, newValue: number | string) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.updatePeopleCell(idOrCategory, monthCol, newValue);
          if (Store.data) {
            Store.data.fss_outflow_oc_people = res.allRows;
            Store.data.fss_outflow_oc_people_report = res.reportRows;
            Store.persist();
          }
          setCloudStatus(prev => ({
            ...prev,
            syncing: false,
            lastSynced: new Date().toLocaleTimeString(),
            error: null
          }));
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __updatePeopleCell:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Add new People entry
      (window as any).__addPeopleExpense = async (categoryName: string, monthlyAmounts: Record<string, number> = {}) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.addPeopleExpense(categoryName, monthlyAmounts);
          await loadSupabaseCashflowTables();
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __addPeopleExpense:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Direct cell edit handler for Project Costs Outflow (fss_outflow_project_cost)
      (window as any).__updateProjectCostCell = async (idOrCategory: number | string, monthCol: string, newValue: number | string) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.updateProjectCostCell(idOrCategory, monthCol, newValue);
          if (Store.data) {
            Store.data.fss_outflow_project_cost = res.allRows;
            cashflowSyncSuppress = true;
            Store.persist();
          }
          setCloudStatus(prev => ({
            ...prev,
            syncing: false,
            lastSynced: new Date().toLocaleTimeString(),
            error: null
          }));
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __updateProjectCostCell:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Add new Project Costs entry
      (window as any).__addProjectCostExpense = async (categoryName: string, monthlyAmounts: Record<string, number> = {}) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.addProjectCostExpense(categoryName, monthlyAmounts);
          await loadSupabaseCashflowTables();
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __addProjectCostExpense:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Direct cell edit handler for Tax & Statutory Outflow (fss_outflow_tax_statutory)
      (window as any).__updateTaxStatutoryCell = async (idOrCategory: number | string, monthCol: string, newValue: number | string) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.updateTaxStatutoryCell(idOrCategory, monthCol, newValue);
          if (Store.data) {
            Store.data.fss_outflow_tax_statutory = res.allRows;
            cashflowSyncSuppress = true;
            Store.persist();
          }
          setCloudStatus(prev => ({
            ...prev,
            syncing: false,
            lastSynced: new Date().toLocaleTimeString(),
            error: null
          }));
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __updateTaxStatutoryCell:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Add new Tax & Statutory entry
      (window as any).__addTaxStatutoryExpense = async (categoryName: string, monthlyAmounts: Record<string, number> = {}) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.addTaxStatutoryExpense(categoryName, monthlyAmounts);
          await loadSupabaseCashflowTables({ skipAutoSeed: true });
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __addTaxStatutoryExpense:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Direct cell edit handler for Travel Outflow (fss_outflow_oc_travel)
      (window as any).__updateTravelCell = async (idOrCategory: number | string, monthCol: string, newValue: number | string) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.updateTravelCell(idOrCategory, monthCol, newValue);
          if (Store.data) {
            Store.data.fss_outflow_oc_travel = res.allRows;
            cashflowSyncSuppress = true;
            Store.persist();
          }
          setCloudStatus(prev => ({
            ...prev,
            syncing: false,
            lastSynced: new Date().toLocaleTimeString(),
            error: null
          }));
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __updateTravelCell:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      (window as any).__addTravelExpense = async (categoryName: string, monthlyAmounts: Record<string, number> = {}) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.addTravelExpense(categoryName, monthlyAmounts);
          await loadSupabaseCashflowTables({ skipAutoSeed: true });
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __addTravelExpense:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Direct cell edit handler for Professional & Admin Outflow (fss_outflow_oc_professional_admin)
      (window as any).__updateProfessionalAdminCell = async (idOrCategory: number | string, monthCol: string, newValue: number | string) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.updateProfessionalAdminCell(idOrCategory, monthCol, newValue);
          if (Store.data) {
            Store.data.fss_outflow_oc_professional_admin = res.allRows;
            cashflowSyncSuppress = true;
            Store.persist();
          }
          setCloudStatus(prev => ({
            ...prev,
            syncing: false,
            lastSynced: new Date().toLocaleTimeString(),
            error: null
          }));
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __updateProfessionalAdminCell:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      (window as any).__addProfessionalAdminExpense = async (categoryName: string, monthlyAmounts: Record<string, number> = {}) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.addProfessionalAdminExpense(categoryName, monthlyAmounts);
          await loadSupabaseCashflowTables({ skipAutoSeed: true });
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __addProfessionalAdminExpense:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Direct cell edit handler for Office Fixed Outflow (fss_outflow_oc_office_fixed)
      (window as any).__updateOfficeFixedCell = async (idOrCategory: number | string, monthCol: string, newValue: number | string) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.updateOfficeFixedCell(idOrCategory, monthCol, newValue);
          if (Store.data) {
            Store.data.fss_outflow_oc_office_fixed = res.allRows;
            cashflowSyncSuppress = true;
            Store.persist();
          }
          setCloudStatus(prev => ({
            ...prev,
            syncing: false,
            lastSynced: new Date().toLocaleTimeString(),
            error: null
          }));
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __updateOfficeFixedCell:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      (window as any).__addOfficeFixedExpense = async (categoryName: string, monthlyAmounts: Record<string, number> = {}) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.addOfficeFixedExpense(categoryName, monthlyAmounts);
          await loadSupabaseCashflowTables({ skipAutoSeed: true });
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __addOfficeFixedExpense:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Direct cell edit handler for Office Variable Outflow (fss_outflow_oc_office_variable)
      (window as any).__updateOfficeVariableCell = async (idOrCategory: number | string, monthCol: string, newValue: number | string) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.updateOfficeVariableCell(idOrCategory, monthCol, newValue);
          if (Store.data) {
            Store.data.fss_outflow_oc_office_variable = res.allRows;
            cashflowSyncSuppress = true;
            Store.persist();
          }
          setCloudStatus(prev => ({
            ...prev,
            syncing: false,
            lastSynced: new Date().toLocaleTimeString(),
            error: null
          }));
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __updateOfficeVariableCell:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      (window as any).__addOfficeVariableExpense = async (categoryName: string, monthlyAmounts: Record<string, number> = {}) => {
        if (!isSupabaseConfigured) return null;
        setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
        try {
          const res = await SupabaseService.addOfficeVariableExpense(categoryName, monthlyAmounts);
          await loadSupabaseCashflowTables({ skipAutoSeed: true });
          render({ keepScroll: true });
          return res;
        } catch (err: any) {
          console.error('Error in __addOfficeVariableExpense:', err);
          setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
          throw err;
        }
      };

      // Delete handlers for Cash Outflow (fss_outflow_*) tables
      const registerOutflowDelete = (globalName: string, serviceMethod: string, opts?: { skipAutoSeed?: boolean }) => {
        (window as any)[globalName] = async (idOrKey: any, monthCol?: string) => {
          if (!isSupabaseConfigured) return false;
          setCloudStatus(prev => ({ ...prev, syncing: true, error: null }));
          try {
            const ok = await (SupabaseService as any)[serviceMethod](idOrKey, monthCol);
            if (!ok) throw new Error(`Failed to delete record from Supabase.`);
            await loadSupabaseCashflowTables(opts);
            setCloudStatus(prev => ({ ...prev, syncing: false, lastSynced: new Date().toLocaleTimeString(), error: null }));
            render({ keepScroll: true });
            return true;
          } catch (err: any) {
            console.error(`Error in ${globalName}:`, err);
            setCloudStatus(prev => ({ ...prev, syncing: false, error: err.message }));
            throw err;
          }
        };
      };

      registerOutflowDelete('__deletePeople', 'deletePeople', { skipAutoSeed: true });
      registerOutflowDelete('__deletePeopleExpense', 'deletePeopleExpense', { skipAutoSeed: true });
      registerOutflowDelete('__deletePeopleFromSupabase', 'deletePeopleFromSupabase', { skipAutoSeed: true });
      registerOutflowDelete('__deletePeopleRow', 'deletePeopleRow', { skipAutoSeed: true });

      registerOutflowDelete('__deleteProjectCost', 'deleteProjectCost', { skipAutoSeed: true });
      registerOutflowDelete('__deleteProjectCostExpense', 'deleteProjectCostExpense', { skipAutoSeed: true });
      registerOutflowDelete('__deleteProjectCostFromSupabase', 'deleteProjectCostFromSupabase', { skipAutoSeed: true });
      registerOutflowDelete('__deleteProjectCostRow', 'deleteProjectCostRow', { skipAutoSeed: true });

      registerOutflowDelete('__deleteCapex', 'deleteCapex', { skipAutoSeed: true });
      registerOutflowDelete('__deleteCapexExpense', 'deleteCapexExpense', { skipAutoSeed: true });
      registerOutflowDelete('__deleteCapexFromSupabase', 'deleteCapexFromSupabase', { skipAutoSeed: true });
      registerOutflowDelete('__deleteCapexRow', 'deleteCapexRow', { skipAutoSeed: true });

      registerOutflowDelete('__deleteFinancingAndOwner', 'deleteFinancingAndOwner', { skipAutoSeed: true });
      registerOutflowDelete('__deleteFinancingAndOwnerExpense', 'deleteFinancingAndOwnerExpense', { skipAutoSeed: true });
      registerOutflowDelete('__deleteFinancingAndOwnerFromSupabase', 'deleteFinancingAndOwnerFromSupabase', { skipAutoSeed: true });
      registerOutflowDelete('__deleteFinancingAndOwnerRow', 'deleteFinancingAndOwnerRow', { skipAutoSeed: true });

      registerOutflowDelete('__deleteOfficeFixed', 'deleteOfficeFixed', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOfficeFixedExpense', 'deleteOfficeFixedExpense', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOfficeFixedFromSupabase', 'deleteOfficeFixedFromSupabase', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOfficeFixedRow', 'deleteOfficeFixedRow', { skipAutoSeed: true });

      registerOutflowDelete('__deleteOfficeVariable', 'deleteOfficeVariable', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOfficeVariableExpense', 'deleteOfficeVariableExpense', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOfficeVariableFromSupabase', 'deleteOfficeVariableFromSupabase', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOfficeVariableRow', 'deleteOfficeVariableRow', { skipAutoSeed: true });

      registerOutflowDelete('__deleteTravel', 'deleteTravel', { skipAutoSeed: true });
      registerOutflowDelete('__deleteTravelExpense', 'deleteTravelExpense', { skipAutoSeed: true });
      registerOutflowDelete('__deleteTravelFromSupabase', 'deleteTravelFromSupabase', { skipAutoSeed: true });
      registerOutflowDelete('__deleteTravelRow', 'deleteTravelRow', { skipAutoSeed: true });

      registerOutflowDelete('__deleteProfessionalAdmin', 'deleteProfessionalAdmin', { skipAutoSeed: true });
      registerOutflowDelete('__deleteProfessionalAdminExpense', 'deleteProfessionalAdminExpense', { skipAutoSeed: true });
      registerOutflowDelete('__deleteProfessionalAdminFromSupabase', 'deleteProfessionalAdminFromSupabase', { skipAutoSeed: true });
      registerOutflowDelete('__deleteProfessionalAdminRow', 'deleteProfessionalAdminRow', { skipAutoSeed: true });

      registerOutflowDelete('__deleteOperationCost', 'deleteOperationCost', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOperationCostExpense', 'deleteOperationCostExpense', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOperationCostFromSupabase', 'deleteOperationCostFromSupabase', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOperationCostRow', 'deleteOperationCostRow', { skipAutoSeed: true });

      registerOutflowDelete('__deleteTaxStatutory', 'deleteTaxStatutory', { skipAutoSeed: true });
      registerOutflowDelete('__deleteTaxStatutoryExpense', 'deleteTaxStatutoryExpense', { skipAutoSeed: true });
      registerOutflowDelete('__deleteTaxStatutoryFromSupabase', 'deleteTaxStatutoryFromSupabase', { skipAutoSeed: true });
      registerOutflowDelete('__deleteTaxStatutoryRow', 'deleteTaxStatutoryRow', { skipAutoSeed: true });

      registerOutflowDelete('__deleteOfficeTravel', 'deleteOfficeTravel', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOfficeTravelExpense', 'deleteOfficeTravelExpense', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOfficeTravelFromSupabase', 'deleteOfficeTravelFromSupabase', { skipAutoSeed: true });
      registerOutflowDelete('__deleteOfficeTravelRow', 'deleteOfficeTravelRow', { skipAutoSeed: true });

      registerOutflowDelete('__deleteOutflowRecord', 'deleteOutflowRecord', { skipAutoSeed: true });

      (window as any).openAddClientModal = () => setShowAddClientModal(true);
      (window as any).openAddVendorModal = () => setShowAddVendorModal(true);
      (window as any).openAddEmployeeModal = () => setShowAddEmployeeModal(true);
      (window as any).openAddOtherPartyModal = () => setShowAddOtherPartyModal(true);
      (window as any).openAddProjectModal = () => setShowAddProjectModal(true);
      (window as any).openAddDepartmentModal = () => setShowAddDepartmentModal(true);
      (window as any).openAddBankAccountModal = () => setShowAddBankAccountModal(true);
      (window as any).openAddCategoryModal = () => setShowAddCategoryModal(true);

      // 13. Check connection and load data from fss tables
      if (isSupabaseConfigured) {
        const isConn = await SupabaseService.testConnection();
        if (mounted) {
          setCloudStatus(prev => ({ ...prev, connected: isConn }));
        }

        if (isConn) {
          await Promise.all([
            loadSupabaseClients(),
            loadSupabaseVendors(),
            loadSupabaseEmployees(),
            loadSupabaseOtherParties(),
            loadSupabaseProjects(),
            loadSupabaseDepartments(),
            loadSupabaseBankAccounts(),
            loadSupabaseCategories(),
            loadSupabaseOrders(),
            loadSupabaseTransactions(),
            loadSupabaseCashflowTables()
          ]);
        }
      }
    };

    init();

    return () => {
      mounted = false;
      if (cashflowDebounceTimer) clearTimeout(cashflowDebounceTimer);
      delete (window as any).__onCashflowDataChanged;
      delete (window as any).__supabaseSaveClient;
      delete (window as any).__supabaseDeleteClient;
      delete (window as any).__supabaseSaveVendor;
      delete (window as any).__supabaseDeleteVendor;
      delete (window as any).__supabaseSaveEmployee;
      delete (window as any).__supabaseDeleteEmployee;
      delete (window as any).__supabaseSaveOtherParty;
      delete (window as any).__supabaseDeleteOtherParty;
      delete (window as any).__supabaseSaveProject;
      delete (window as any).__supabaseDeleteProject;
      delete (window as any).__supabaseSaveDepartment;
      delete (window as any).__supabaseDeleteDepartment;
      delete (window as any).__supabaseSaveBankAccount;
      delete (window as any).__supabaseDeleteBankAccount;
      delete (window as any).__supabaseSaveCategory;
      delete (window as any).__supabaseDeleteCategory;
      delete (window as any).__supabaseSaveOrder;
      delete (window as any).__supabaseDeleteOrder;
      delete (window as any).__supabaseSaveTransaction;
      delete (window as any).__supabaseCancelTransaction;
      delete (window as any).__supabaseDeleteTransaction;
      delete (window as any).__supabaseSyncCashflowInflow;
      delete (window as any).__supabaseFetchCashflowInflow;
      delete (window as any).__updateOperationReceiptCell;
      delete (window as any).__addOperationReceipt;
      delete (window as any).__updateIncomeCell;
      delete (window as any).__addIncome;
      delete (window as any).__updateFinancingCell;
      delete (window as any).__addFinancing;
      delete (window as any).__updatePeopleCell;
      delete (window as any).__addPeopleExpense;
      delete (window as any).__updateProjectCostCell;
      delete (window as any).__addProjectCostExpense;
      delete (window as any).__updateTaxStatutoryCell;
      delete (window as any).__addTaxStatutoryExpense;
      delete (window as any).__updateTravelCell;
      delete (window as any).__addTravelExpense;
      delete (window as any).__updateProfessionalAdminCell;
      delete (window as any).__addProfessionalAdminExpense;
      delete (window as any).__updateOfficeFixedCell;
      delete (window as any).__addOfficeFixedExpense;
      delete (window as any).__updateOfficeVariableCell;
      delete (window as any).__addOfficeVariableExpense;

      // Clean up outflow delete handlers
      const outflowDeleteNames = [
        '__deletePeople', '__deletePeopleExpense', '__deletePeopleFromSupabase', '__deletePeopleRow',
        '__deleteProjectCost', '__deleteProjectCostExpense', '__deleteProjectCostFromSupabase', '__deleteProjectCostRow',
        '__deleteCapex', '__deleteCapexExpense', '__deleteCapexFromSupabase', '__deleteCapexRow',
        '__deleteFinancingAndOwner', '__deleteFinancingAndOwnerExpense', '__deleteFinancingAndOwnerFromSupabase', '__deleteFinancingAndOwnerRow',
        '__deleteOfficeFixed', '__deleteOfficeFixedExpense', '__deleteOfficeFixedFromSupabase', '__deleteOfficeFixedRow',
        '__deleteOfficeVariable', '__deleteOfficeVariableExpense', '__deleteOfficeVariableFromSupabase', '__deleteOfficeVariableRow',
        '__deleteTravel', '__deleteTravelExpense', '__deleteTravelFromSupabase', '__deleteTravelRow',
        '__deleteProfessionalAdmin', '__deleteProfessionalAdminExpense', '__deleteProfessionalAdminFromSupabase', '__deleteProfessionalAdminRow',
        '__deleteOperationCost', '__deleteOperationCostExpense', '__deleteOperationCostFromSupabase', '__deleteOperationCostRow',
        '__deleteTaxStatutory', '__deleteTaxStatutoryExpense', '__deleteTaxStatutoryFromSupabase', '__deleteTaxStatutoryRow',
        '__deleteOfficeTravel', '__deleteOfficeTravelExpense', '__deleteOfficeTravelFromSupabase', '__deleteOfficeTravelRow',
        '__deleteOutflowRecord'
      ];
      outflowDeleteNames.forEach(n => delete (window as any)[n]);
      delete (window as any).openAddClientModal;
      delete (window as any).openAddVendorModal;
      delete (window as any).openAddEmployeeModal;
      delete (window as any).openAddOtherPartyModal;
      delete (window as any).openAddProjectModal;
      delete (window as any).openAddDepartmentModal;
      delete (window as any).openAddBankAccountModal;
      delete (window as any).openAddCategoryModal;
    };
  }, [loadSupabaseClients, loadSupabaseVendors, loadSupabaseEmployees, loadSupabaseOtherParties, loadSupabaseProjects, loadSupabaseDepartments, loadSupabaseBankAccounts, loadSupabaseCategories, loadSupabaseOrders, loadSupabaseTransactions, loadSupabaseCashflowTables]);

  return (
    <>
      <div className="app">
        <aside className="sidebar" id="sidebar">
          <div className="brand">
            <div className="brand-mark">IU</div>
            <div>
              <div className="brand-name">IUOVA</div>
              <div className="brand-sub">Cashflow · v2</div>
            </div>
          </div>
          <nav className="nav" id="nav"></nav>
          <div className="side-foot" id="sideFoot"></div>
        </aside>

        <main className="main">
          <header className="topbar">
            <button className="icon-btn menu-btn" id="menuBtn" aria-label="Menu"></button>
            <h1 id="pageTitle">Dashboard</h1>

            <div className="top-actions">
              {/* Cloud Sync Status Indicator */}
              <button
                type="button"
                className={`cloud-sync-pill ${cloudStatus.connected ? 'online' : cloudStatus.configured ? 'offline' : 'local'}`}
                onClick={() => setShowCloudModal(true)}
                title={
                  cloudStatus.connected
                    ? `Supabase Connected · ${cloudStatus.clientCount ?? 0} clients, ${cloudStatus.vendorCount ?? 0} vendors, ${cloudStatus.transactionCount ?? 0} transactions, ${cloudStatus.orderCount ?? 0} orders · Last synced: ${cloudStatus.lastSynced || 'Just now'}`
                    : cloudStatus.configured
                    ? 'Supabase Configured (Connecting...)'
                    : 'Local Mode (Click to connect Supabase)'
                }
              >
                <span className="cloud-dot"></span>
                <span className="cloud-label">
                  {cloudStatus.syncing
                    ? 'Syncing...'
                    : cloudStatus.connected
                    ? `Supabase (${cloudStatus.transactionCount ?? 0} txns · ${cloudStatus.orderCount ?? 0} orders · ${cloudStatus.clientCount ?? 0} clients · ${cloudStatus.vendorCount ?? 0} vendors)`
                    : cloudStatus.configured
                    ? 'Connecting'
                    : 'Local Mode'}
                </span>
              </button>

              <select className="select sel-sm" id="fySelect" aria-label="Financial year"></select>
              <select className="select sel-sm user-sel" id="userSelect" aria-label="Logged in as"></select>
              <button className="btn btn-gold btn-add" id="addBtn"></button>
            </div>
          </header>

          <div className="view" id="view"></div>
        </main>
      </div>

      <nav className="bottom-nav" id="bottomNav"></nav>
      <button className="fab" id="fab" aria-label="Add entry"></button>
      <div id="layer"></div>
      <div className="toasts" id="toasts"></div>

      {/* Supabase Connection Modal */}
      {showCloudModal && (
        <div className="drawer-ov" onClick={() => setShowCloudModal(false)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-h">
              <h2>Supabase Cloud Database</h2>
              <button className="icon-btn xs" onClick={() => setShowCloudModal(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="modal-b stack">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: cloudStatus.connected ? '#1E7A4F' : cloudStatus.configured ? '#EBA937' : '#7B8396'
                  }}
                />
                <div>
                  <strong>
                    {cloudStatus.connected
                      ? `Connected (${cloudStatus.transactionCount ?? 0} transactions, ${cloudStatus.orderCount ?? 0} orders, ${cloudStatus.clientCount ?? 0} clients, ${cloudStatus.vendorCount ?? 0} vendors)`
                      : cloudStatus.configured
                      ? 'Connecting to Supabase...'
                      : 'Running in Local Mode'}
                  </strong>
                  <div className="sub" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    {cloudStatus.lastSynced ? `Last synchronized at ${cloudStatus.lastSynced}` : 'Local data persistence'}
                  </div>
                </div>
              </div>

              {cloudStatus.error && (
                <div className="notice warn" style={{ fontSize: '12px', color: 'var(--out)' }}>
                  {cloudStatus.error}
                </div>
              )}

              <div className="card" style={{ padding: '14px', background: 'var(--surface-2)', fontSize: '13px' }}>
                <strong>Table Integration</strong>
                <p style={{ marginTop: '6px', color: 'var(--ink-2)', lineHeight: '1.5' }}>
                  Transactions: <code>fss_table_transactions</code>.<br />
                  Orders: <code>fss_table_orders</code>, <code>fss_table_order_departments</code>, <code>fss_table_order_milestones</code>, <code>fss_table_order_documents</code>.<br />
                  Clients: <code>fss_client</code> &amp; <code>fss_client_people</code>.<br />
                  Vendors: <code>fss_vendor</code> &amp; <code>fss_vendor_people</code>.<br />
                  Employees: <code>fss_employe</code>.<br />
                  Other Parties: <code>fss_other_parties</code>.<br />
                  Projects: <code>fss_projects</code>.<br />
                  Departments: <code>fss_departments</code>.<br />
                  Bank Accounts: <code>fss_bank_accounts</code>.<br />
                  Categories: <code>fss_categories</code>.<br />
                  Cashflow Inflow: <code>fss_operation_receipts</code> ({cloudStatus.operationReceiptCount ?? '—'}), <code>fss_income</code> ({cloudStatus.incomeCount ?? '—'}), <code>fss_financing</code> ({cloudStatus.financingCount ?? '—'}), <code>fss_cash_inflow</code> ({cloudStatus.cashInflowCount ?? '—'}).<br />
                  People Outflow: <code>fss_outflow_oc_people</code> ({cloudStatus.peopleCount ?? '—'}), <code>fss_outflow_oc_people_report</code> (View).
                </p>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--muted)' }}>
                  Target tables: <code>public.fss_operation_receipts</code>, <code>public.fss_income</code>, <code>public.fss_financing</code>, <code>public.fss_cash_inflow</code>, <code>public.fss_outflow_oc_people</code>, <code>public.fss_table_transactions</code>, <code>public.fss_table_orders</code>, <code>public.fss_client</code>, <code>public.fss_vendor</code>, <code>public.fss_employe</code>, <code>public.fss_other_parties</code>, <code>public.fss_projects</code>, <code>public.fss_departments</code>, <code>public.fss_bank_accounts</code>, <code>public.fss_categories</code>
                </div>
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                {isSupabaseConfigured && (
                  <button
                    type="button"
                    className="btn btn-navy"
                    disabled={cloudStatus.syncing}
                    onClick={() => refreshAllFromSupabase()}
                  >
                    {cloudStatus.syncing ? 'Syncing...' : 'Refresh from Supabase'}
                  </button>
                )}
                <button type="button" className="btn" onClick={() => setShowCloudModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* React Add Client Modal */}
      <AddClientModal
        isOpen={showAddClientModal}
        onClose={() => setShowAddClientModal(false)}
        onSuccess={handleClientAdded}
      />

      {/* React Add Vendor Modal */}
      <AddVendorModal
        isOpen={showAddVendorModal}
        onClose={() => setShowAddVendorModal(false)}
        onSuccess={handleVendorAdded}
      />

      {/* React Add Employee Modal */}
      <AddEmployeeModal
        isOpen={showAddEmployeeModal}
        onClose={() => setShowAddEmployeeModal(false)}
        onSuccess={handleEmployeeAdded}
        departments={Store.data?.departments || []}
      />

      {/* React Add Other Party Modal */}
      <AddOtherPartyModal
        isOpen={showAddOtherPartyModal}
        onClose={() => setShowAddOtherPartyModal(false)}
        onSuccess={handleOtherPartyAdded}
      />

      {/* React Add Project Modal */}
      <AddProjectModal
        isOpen={showAddProjectModal}
        onClose={() => setShowAddProjectModal(false)}
        onSuccess={handleProjectAdded}
        clients={Store.data?.parties || []}
        departments={Store.data?.departments || []}
      />

      {/* React Add Department Modal */}
      <AddDepartmentModal
        isOpen={showAddDepartmentModal}
        onClose={() => setShowAddDepartmentModal(false)}
        onSuccess={handleDepartmentAdded}
      />

      {/* React Add Bank Account Modal */}
      <AddBankAccountModal
        isOpen={showAddBankAccountModal}
        onClose={() => setShowAddBankAccountModal(false)}
        onSuccess={handleBankAccountAdded}
      />

      {/* React Add Category Modal */}
      <AddCategoryModal
        isOpen={showAddCategoryModal}
        onClose={() => setShowAddCategoryModal(false)}
        onSuccess={handleCategoryAdded}
      />
    </>
  );
};

export default App;
