import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import logger from '#config/logger.js';
import { db } from '#config/db.js';
import { users } from '#models/user.models.js';

const SALT_ROUNDS = 10;

const publicColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  createdAt: users.createdAt,
};

export const hashPassword = async password => {
  try {
    return await bcrypt.hash(password, SALT_ROUNDS);
  } catch (error) {
    logger.error(`Error hashing the password: ${error}`);
    throw new Error('Error hashing the password', { cause: error });
  }
};

export const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    logger.error(`Error comparing the password: ${error}`);
    throw new Error('Error comparing the password', { cause: error });
  }
};

// Returns the full row (including the password hash) so sign-in can compare it.
export const findUserByEmail = async email => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user ?? null;
  } catch (error) {
    logger.error(`Error finding user by email: ${error}`);
    throw new Error('Error finding user by email', { cause: error });
  }
};

// Never returns the password hash.
export const findUserById = async id => {
  try {
    const [user] = await db
      .select(publicColumns)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user ?? null;
  } catch (error) {
    logger.error(`Error finding user by id: ${error}`);
    throw new Error('Error finding user by id', { cause: error });
  }
};

export const createUser = async ({ name, email, password, role = 'user' }) => {
  try {
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const passwordHash = await hashPassword(password);

    const [newUser] = await db
      .insert(users)
      .values({ name, email, password: passwordHash, role })
      .returning(publicColumns);

    logger.info(`User ${newUser.email} created successfully`);
    return newUser;
  } catch (error) {
    logger.error(`Error creating the user: ${error}`);
    throw error;
  }
};

export const authenticateUser = async ({ email, password }) => {
  try {
    const existingUser = await findUserByEmail(email);

    if (!existingUser) {
      throw new Error('User not found');
    }

    const isPasswordValid = await comparePassword(
      password,
      existingUser.password
    );

    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    logger.info(`User ${existingUser.email} authenticated successfully`);

    // Never hand the password hash back to callers.
    return {
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email,
      role: existingUser.role,
      createdAt: existingUser.createdAt,
    };
  } catch (error) {
    logger.error(`Error authenticating the user: ${error}`);
    throw error;
  }
};
