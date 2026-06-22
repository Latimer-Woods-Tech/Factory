#!/usr/bin/env node

const requiredOwners = {
  'adrper79@gmail.com': { allowExternal: true },
  'aperry@latwoodtech.com': { allowExternal: false },
  'blackkryptonians@gmail.com': { allowExternal: true },
};

const raw = process.env.STUDIO_ALLOWED_USERS_JSON;
if (!raw) {
  console.error('::error::STUDIO_ALLOWED_USERS_JSON is required');
  process.exit(1);
}

let allowedUsers;
try {
  allowedUsers = JSON.parse(raw);
} catch {
  console.error('::error::STUDIO_ALLOWED_USERS_JSON must be valid JSON');
  process.exit(1);
}

const invalidOwners = Object.entries(requiredOwners).filter(([email, requirement]) => {
  const user = allowedUsers?.[email];
  return user?.role !== 'owner'
    || (requirement.allowExternal && user?.allowExternal !== true);
});
if (invalidOwners.length > 0) {
  console.error(`::error::Required production owners are missing or misconfigured: ${invalidOwners.map(([email]) => email).join(', ')}`);
  process.exit(1);
}

console.log(`Verified ${Object.keys(requiredOwners).length} required production owners`);
