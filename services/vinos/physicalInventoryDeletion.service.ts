import { auditService } from '../audit/audit.service';
import { physicalInventoryService, type PhysicalInventory } from './physicalInventory.service';

export const physicalInventoryDeletionService = {
  async remove(input: {
    inventory: PhysicalInventory;
    reason: string;
    userId: string;
    userName: string;
    branchId: string;
    branchName: string | null;
  }) {
    const reason = input.reason.trim();
    if (!reason) throw new Error('La observacion es obligatoria para eliminar el inventario.');
    const items = await physicalInventoryService.listItems(input.inventory.id);
    // Audit and inventory live in different stores: persist authorization before deleting.
    let recorded: boolean;
    try {
      recorded = await auditService.writeRequired({
        branch_id: input.branchId,
        branch_name: input.branchName || 'Casa Tahona',
        user_id: input.userId,
        user_name: input.userName,
        action_type: 'ELIMINAR',
        module: 'vinos',
        entity_type: 'inventario',
        entity_id: input.inventory.id,
        description: `Eliminacion autorizada de inventario: ${input.inventory.name}`,
        justification: reason,
        previous_data: { ...input.inventory, items },
        new_data: { deletion_stage: 'AUTHORIZED', observation: reason },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo registrar el motivo.';
      throw new Error(`El inventario no fue eliminado. ${message}`);
    }
    if (!recorded) {
      throw new Error('No se pudo guardar la observacion en auditoria. El inventario no fue eliminado. Intenta nuevamente.');
    }
    await physicalInventoryService.deleteInventory(input.inventory.id);
  },
};
