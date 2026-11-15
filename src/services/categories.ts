import { withActual } from '../actual/client';
import type { ActualCategoryGroup } from './types';

export interface CategoryView {
  id: string;
  name: string;
  groupId: string;
  isIncome: boolean;
  hidden: boolean;
}

export interface CategoryGroupView {
  id: string;
  name: string;
  isIncome: boolean;
  hidden: boolean;
  categories: CategoryView[];
}

export interface ListCategoryGroupsOptions {
  includeHidden?: boolean;
  /** Restrict to income (`true`) or expense (`false`) groups. */
  income?: boolean;
}

export function toCategoryGroupViews(
  groups: ActualCategoryGroup[],
  { includeHidden = false, income }: ListCategoryGroupsOptions = {},
): CategoryGroupView[] {
  return groups
    .map((g) => ({
      id: g.id,
      name: g.name,
      isIncome: Boolean(g.is_income),
      hidden: Boolean(g.hidden),
      categories: (g.categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        groupId: c.group_id ?? g.id,
        isIncome: Boolean(c.is_income ?? g.is_income),
        hidden: Boolean(c.hidden),
      })),
    }))
    .filter((g) => includeHidden || !g.hidden)
    .filter((g) => income === undefined || g.isIncome === income)
    .map((g) => ({ ...g, categories: g.categories.filter((c) => includeHidden || !c.hidden) }))
    .filter((g) => g.categories.length > 0);
}

export function listCategoryGroups(
  opts: ListCategoryGroupsOptions = {},
): Promise<CategoryGroupView[]> {
  return withActual(async (actual) => {
    const groups = ((await actual.getCategoryGroups()) ?? []) as ActualCategoryGroup[];
    return toCategoryGroupViews(groups, opts);
  });
}
