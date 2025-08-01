import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Rating model attributes:
 * @typedef {Object} Rating
 * @property {number} id
 * @property {number} raterId
 * @property {number} ratedUserId
 * @property {number} [skillId]
 * @property {number} rating
 * @property {string} [comment]
 * @property {Date} [createdAt]
 * @property {Date} [updatedAt]
 */

class Rating extends Model {
  // You can add JSDoc comments for properties if needed
}
Rating.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    raterId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    ratedUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    skillId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'skills',
        key: 'id',
      },
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5,
      },
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'ratings',
    sequelize,
    timestamps: true,
  }
);

export default Rating;
