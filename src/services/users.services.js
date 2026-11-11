import { eq } from 'drizzle-orm';
import logger from '#config/logger.js';
import { db } from '#config/db.js';
import { users } from '#models/user.models.js';
import { hashPassword, findUserByEmail } from '#services/auth.services.js';

const publicColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export const getAllUsers = async () => {
  try {
    return await db.select(publicColumns).from(users);
  } catch (error) {
    logger.error(`Error getting users: ${error}`);
    throw new Error('Error getting users', { cause: error });
  }
};

export const getUserById = async id => {
  try {
    const [user] = await db
      .select(publicColumns)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  } catch (error) {
    logger.error(`Error getting user by id: ${error}`);
    throw error;
  }
};

export const updateUser = async (id, updates) => {
  try {
    await getUserById(id);

    const data = { ...updates };

    if (data.email) {
      const existing = await findUserByEmail(data.email);
      if (existing && existing.id !== id) {
        throw new Error('User with this email already exists');
      }
    }

    if (data.password) {
      data.password = await hashPassword(data.password);
    }

    const [updated] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning(publicColumns);

    logger.info(`User ${updated.email} updated successfully`);
    return updated;
  } catch (error) {
    logger.error(`Error updating user: ${error}`);
    throw error;
  }
};

export const deleteUser = async id => {
  try {
    const [deleted] = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id, email: users.email });

    if (!deleted) {
      throw new Error('User not found');
    }

    logger.info(`User ${deleted.email} deleted successfully`);
    return deleted;
  } catch (error) {
    logger.error(`Error deleting user: ${error}`);
    throw error;
  }
};
