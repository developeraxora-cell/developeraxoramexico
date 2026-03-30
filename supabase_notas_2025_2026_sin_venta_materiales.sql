SELECT
  cn.id,
  cn.folio,
  cn.issue_date,
  cn.due_date,
  cn.total,
  cn.balance,
  CASE
    WHEN cn.folio ~ '^LEG-[0-9]+$' THEN replace(cn.folio, 'LEG-', '')::bigint
    WHEN cn.folio ~ '^[0-9]+$' THEN cn.folio::bigint
    ELSE NULL
  END AS legacy_sale_id_normalized
FROM public.credit_notes cn
LEFT JOIN public.inventory_transactions it_by_id
  ON it_by_id.id = cn.inventory_transaction_id
LEFT JOIN public.inventory_transactions it_by_ref
  ON it_by_ref.reference = cn.folio
 AND it_by_ref.branch_id = cn.branch_id
 AND it_by_ref.type = 'SALE'
WHERE cn.branch_id = 1
  AND cn.balance > 0
  AND cn.issue_date >= DATE '2025-01-01'
  AND cn.issue_date < DATE '2027-01-01'
  AND (
    (cn.inventory_transaction_id IS NULL OR it_by_id.id IS NULL)
    AND it_by_ref.id IS NULL
  )
ORDER BY cn.issue_date DESC, cn.folio;
