import User from './User.js';
import Skill from './Skill.js';
import Rating from './Rating.js';

// Define associations
User.hasMany(Skill, { foreignKey: 'userId', as: 'skills' });
Skill.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Rating, { foreignKey: 'raterId', as: 'givenRatings' });
User.hasMany(Rating, { foreignKey: 'ratedUserId', as: 'receivedRatings' });
Rating.belongsTo(User, { foreignKey: 'raterId', as: 'rater' });
Rating.belongsTo(User, { foreignKey: 'ratedUserId', as: 'ratedUser' });

Skill.hasMany(Rating, { foreignKey: 'skillId', as: 'ratings' });
Rating.belongsTo(Skill, { foreignKey: 'skillId', as: 'skill' });

export default { User, Skill, Rating };

export const syncDatabase = async () => {
  try {
    await User.sync();
    await Skill.sync();
    await Rating.sync();
    console.log('Database synced successfully');
  } catch (error) {
    console.warn('Database sync failed - this is expected in demo environment without PostgreSQL:', error.message);
  }
};
