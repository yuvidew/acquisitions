import logger from '#config/logger.js';
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
} from '#services/users.services.js';
import { userIdSchema } from '#validations/users.validations.js';

const parseId = (req, res) => {
  const result = userIdSchema.safeParse(req.params);

  if (!result.success) {
    res.status(400).json({ error: 'Invalid user id' });
    return null;
  }

  return result.data.id;
};

const handleError = (error, res, next) => {
  if (error.message === 'User not found') {
    return res.status(404).json({ error: 'User not found' });
  }

  if (error.message === 'User with this email already exists') {
    return res.status(409).json({ error: 'Email already exist' });
  }

  next(error);
};

export const fetchAllUsers = async (req, res, next) => {
  try {
    const allUsers = await getAllUsers();

    res.status(200).json({
      message: 'Users retrieved',
      count: allUsers.length,
      users: allUsers,
    });
  } catch (error) {
    logger.error('Get users error', error);
    next(error);
  }
};

export const fetchUserById = async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;

    const user = await getUserById(id);

    res.status(200).json({ message: 'User retrieved', user });
  } catch (error) {
    logger.error('Get user error', error);
    handleError(error, res, next);
  }
};

export const updateUserById = async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;

    const user = await updateUser(id, req.body);

    res.status(200).json({ message: 'User updated', user });
  } catch (error) {
    logger.error('Update user error', error);
    handleError(error, res, next);
  }
};

export const deleteUserById = async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;

    await deleteUser(id);

    res.status(200).json({ message: 'User deleted' });
  } catch (error) {
    logger.error('Delete user error', error);
    handleError(error, res, next);
  }
};
