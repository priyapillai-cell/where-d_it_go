import {
  insertCategory,
  listCategories,
  nextCategorySortOrder,
  reorderCategories,
  updateCategory,
} from '@/db/repositories/categoryRepository';
import type { SqlDatabase } from '@/db/sqlDatabase';
import { moveInList } from '@/domain/ordering';
import { type Category, type CategoryType, err, ok, type Result } from '@/domain/types';
import { type FieldErrors, validateName } from '@/domain/validation';
import { newId } from '@/utils/id';

export interface CategoryInput {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
}

export type CategoryFieldErrors = FieldErrors<'name'>;

/** The type of an existing category never changes: its transactions depend on it. */
export async function saveCategory(
  db: SqlDatabase,
  input: CategoryInput,
  existingId?: string,
): Promise<Result<Category, CategoryFieldErrors>> {
  const nameError = validateName(input.name);
  if (nameError) return err({ name: nameError });
  return db.transaction(async (tx) => {
    const existing = existingId
      ? ((await listCategories(tx)).find((c) => c.id === existingId) ?? null)
      : null;
    if (existingId && !existing) return err({ name: 'required' });
    const category: Category = existing
      ? { ...existing, name: input.name.trim(), icon: input.icon, color: input.color }
      : {
          id: newId(),
          name: input.name.trim(),
          type: input.type,
          icon: input.icon,
          color: input.color,
          sortOrder: await nextCategorySortOrder(tx, input.type),
          isArchived: false,
        };
    if (existing) await updateCategory(tx, category);
    else await insertCategory(tx, category);
    return ok(category);
  });
}

export async function setCategoryArchived(
  db: SqlDatabase,
  id: string,
  archived: boolean,
): Promise<Result<void, 'notFound'>> {
  const category = (await listCategories(db)).find((c) => c.id === id);
  if (!category) return err('notFound');
  await updateCategory(db, { ...category, isArchived: archived });
  return ok(undefined);
}

/** Moves a category within its own type's ordering. */
export async function moveCategory(db: SqlDatabase, id: string, direction: -1 | 1): Promise<void> {
  await db.transaction(async (tx) => {
    const all = await listCategories(tx);
    const type = all.find((c) => c.id === id)?.type;
    if (!type) return;
    const ids = all.filter((c) => c.type === type).map((c) => c.id);
    await reorderCategories(tx, moveInList(ids, id, direction));
  });
}
