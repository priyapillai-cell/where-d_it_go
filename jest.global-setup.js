// Period and recurrence math runs in local time; pin the zone so results are deterministic.
module.exports = async () => {
  process.env.TZ = 'UTC';
};
