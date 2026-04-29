const DEFAULT_BRANCH_FOOTER = 'KILOMETRO, 3 LAS CANOAS, JESUS MARIA JALISCO   (348) 148 8326';
const DEGOLLADO_BRANCH_FOOTER = 'KM 4.5 CARRETERA LA PIEDAD GUADALAJARA   (348) 121499';
const CONCRETERA_BRANCH_1_FOOTER = 'KM 4.5 CARRETERA LA PIEDAD GUADALAJARA   332 600 0677';

export const getBranchFooterText = (
  branchName?: string | null,
  options?: {
    moduleLabel?: 'MATERIALES' | 'CONCRETERA' | null;
    branchId?: string | number | null;
  }
) => {
  const normalizedBranchName = String(branchName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  const normalizedModule = String(options?.moduleLabel ?? '').trim().toUpperCase();
  const normalizedBranchId = String(options?.branchId ?? '').trim();

  if (normalizedModule === 'CONCRETERA' && normalizedBranchId === '1') {
    return CONCRETERA_BRANCH_1_FOOTER;
  }

  if (normalizedBranchName.includes('DEGOLLADO')) {
    return DEGOLLADO_BRANCH_FOOTER;
  }

  return DEFAULT_BRANCH_FOOTER;
};
