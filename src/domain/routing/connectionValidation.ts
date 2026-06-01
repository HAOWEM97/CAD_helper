import type { CableQuantity, CableSpec, ConnectionCableItem } from '@/domain/project/types';

export type ConnectionValidationResult =
  | {
      compatible: true;
      reason: string;
    }
  | {
      compatible: false;
      reason: string;
    };

function specById(cableSpecs: CableSpec[]) {
  return new Map(cableSpecs.map((spec) => [spec.id, spec]));
}

function itemKey(item: ConnectionCableItem, cableSpecsById: Map<string, CableSpec>) {
  if (item.acceptsAnyCable) {
    return '*';
  }

  const spec = cableSpecsById.get(item.cableSpecId);
  return spec?.model ?? item.cableSpecId;
}

function itemLabel(item: ConnectionCableItem, cableSpecsById: Map<string, CableSpec>) {
  if (item.acceptsAnyCable) {
    return '不限';
  }

  return cableSpecsById.get(item.cableSpecId)?.model ?? item.cableSpecId;
}

function hasAnyCableSink(items: ConnectionCableItem[]) {
  return items.some((item) => item.acceptsAnyCable && item.quantity.mode === 'unlimited');
}

export function quantityText(quantity: CableQuantity) {
  return quantity.mode === 'unlimited' ? '不限' : String(quantity.count);
}

export function connectionItemsHaveUnlimitedCapacity(items: ConnectionCableItem[]) {
  return items.some((item) => item.quantity.mode === 'unlimited');
}

export function summarizeConnectionItems(items: ConnectionCableItem[], cableSpecs: CableSpec[]) {
  if (items.length === 0) {
    return '无';
  }

  const cableSpecsById = specById(cableSpecs);
  return items
    .map((item) => {
      const usageText = item.usage?.trim() ? `${item.usage.trim()} / ` : '';
      return `${usageText}${itemLabel(item, cableSpecsById)} x ${quantityText(item.quantity)} @ ${
        item.connectionHeightMm
      }mm`;
    })
    .join('；');
}

export function connectionItemsToCableIds(items: ConnectionCableItem[], cableSpecs: CableSpec[]) {
  const cableSpecsById = specById(cableSpecs);
  return items.map((item) => {
    return `${itemLabel(item, cableSpecsById)}x${quantityText(item.quantity)}`;
  });
}

export function validateConnectionItems(
  fromItems: ConnectionCableItem[],
  toItems: ConnectionCableItem[],
  cableSpecs: CableSpec[],
): ConnectionValidationResult {
  if (fromItems.length === 0 || toItems.length === 0) {
    return {
      compatible: false,
      reason: '起点或终点缺少接线孔线缆明细。',
    };
  }

  const cableSpecsById = specById(cableSpecs);
  const toAcceptsAnyCable = hasAnyCableSink(toItems);
  const toItemsByKey = new Map(toItems.map((item) => [itemKey(item, cableSpecsById), item]));

  for (const fromItem of fromItems) {
    if (fromItem.quantity.mode === 'unlimited') {
      return {
        compatible: false,
        reason: '不限接线孔不作为主动路由起点。',
      };
    }

    const fromLabel = itemLabel(fromItem, cableSpecsById);
    const toItem = toItemsByKey.get(itemKey(fromItem, cableSpecsById));
    if (!toItem) {
      if (toAcceptsAnyCable) {
        continue;
      }

      return {
        compatible: false,
        reason: `终点缺少 ${fromLabel}。`,
      };
    }

    if (toItem.quantity.mode === 'unlimited') {
      continue;
    }

    if (toItem.quantity.count !== fromItem.quantity.count) {
      return {
        compatible: false,
        reason: `${fromLabel} 数量不一致：起点 ${fromItem.quantity.count}，终点 ${toItem.quantity.count}。`,
      };
    }
  }

  return {
    compatible: true,
    reason: toAcceptsAnyCable ? '终点可承接任意线缆。' : '线缆型号和数量匹配。',
  };
}
