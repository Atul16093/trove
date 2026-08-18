export enum AuthMessages {
  REGISTERED = 'Account created',
  LOGGED_IN = 'Signed in',
  INVALID_CREDENTIALS = 'Email or password is incorrect',
  EMAIL_TAKEN = 'An account with this email already exists',
  GOOGLE_FAILED = 'Google sign-in could not be verified',
  UNAUTHORIZED = 'Not signed in',
}

export enum ItemMessages {
  SAVED = 'Link saved',
  LISTED = 'Items loaded',
  FOUND = 'Item loaded',
  UPDATED = 'Item updated',
  DELETED = 'Link removed',
  NOT_FOUND = 'Item not found',
  OPENED = 'Opened',
  REPROCESSING = 'Re-sorting unfinished items',
  REGENERATED = 'Summary regenerated',
  NOT_REGENERABLE = 'Files have no AI summary to regenerate',
}

export enum CategoryMessages {
  LISTED = 'Categories loaded',
  CREATED = 'Category created',
  UPDATED = 'Category updated',
  DELETED = 'Category deleted — its items moved to Other',
  REORDERED = 'Order saved',
  NOT_FOUND = 'Category not found',
  SLUG_TAKEN = 'You already have a category with that name',
  SYSTEM_LOCKED = "Default categories can't be deleted, but you can rename or recolor them.",
}

export enum TelegramMessages {
  TOKEN_CREATED = 'Connect link ready',
  STATUS_OK = 'Status loaded',
}
