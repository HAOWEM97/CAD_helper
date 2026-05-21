import type { CableBundle, CableBundleItem, CableQuantity } from '@/domain/project/types';

export type ConnectionValidationResult =
  | {
      compatible: true;
      reason: string;
    }
  | {
      compatible: false;
      reason: string;
    };

function itemKey(item: CableBundleItem) {
  return `${item.usage}|${item.model}`;
}

function quantityText(quantity: CableQuantity) {
  return quantity.mode === 'unlimited' ? '不限' : String(quantity.count);
}

export function bundleHasUnlimitedCapacity(bundle: CableBundle) {
  return bundle.items.some((item) => item.quantity.mode === 'unlimited');
}

export function summarizeCableBundle(bundle: CableBundle) {
  if (bundle.items.length === 0) {
    return '无';
  }

  return bundle.items
    .map((item) => `${item.usage}/${item.model} x ${quantityText(item.quantity)}`)
    .join('；');
}

export function cableBundleToCableIds(bundle: CableBundle) {
  return bundle.items.map((item) => `${item.usage}:${item.model}x${quantityText(item.quantity)}`);
}

export function validateConnectionBundles(
  fromBundle: CableBundle,
  toBundle: CableBundle,
): ConnectionValidationResult {
  if (fromBundle.items.length === 0 || toBundle.items.length === 0) {
    return {
      compatible: false,
      reason: '起点或终点缺少线缆组合。',
    };
  }

  const toItemsByKey = new Map(toBundle.items.map((item) => [itemKey(item), item]));

  for (const fromItem of fromBundle.items) {
    if (fromItem.quantity.mode === 'unlimited') {
      return {
        compatible: false,
        reason: '不限接线孔不作为主动路由起点。',
      };
    }

    const toItem = toItemsByKey.get(itemKey(fromItem));
    if (!toItem) {
      return {
        compatible: false,
        reason: `终点缺少 ${fromItem.usage}/${fromItem.model}。`,
      };
    }

    if (toItem.quantity.mode === 'unlimited') {
      continue;
    }

    if (toItem.quantity.count !== fromItem.quantity.count) {
      return {
        compatible: false,
        reason: `${fromItem.usage}/${fromItem.model} 数量不一致：起点 ${fromItem.quantity.count}，终点 ${toItem.quantity.count}。`,
      };
    }
  }

  return {
    compatible: true,
    reason: '线缆用途、型号和数量匹配。',
  };
}
