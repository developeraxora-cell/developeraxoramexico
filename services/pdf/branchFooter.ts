const DEFAULT_BRANCH_FOOTER = 'KILOMETRO, 3 LAS CANOAS, JESUS MARIA JALISCO   (348) 148 8326';
const DEGOLLADO_BRANCH_FOOTER = 'KM 4.5 CARRETERA LA PIEDAD GUADALAJARA   (348) 121499';

export const getBranchFooterText = (branchName?: string | null) => {
  const normalizedBranchName = String(branchName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  if (normalizedBranchName.includes('DEGOLLADO')) {
    return DEGOLLADO_BRANCH_FOOTER;
  }

  return DEFAULT_BRANCH_FOOTER;
};
