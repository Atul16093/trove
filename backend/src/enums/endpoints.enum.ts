export enum Modules {
  AUTH = 'auth',
  ITEMS = 'items',
  CATEGORIES = 'categories',
  TELEGRAM = 'telegram',
}

export enum AuthEndpoints {
  REGISTER = 'register',
  LOGIN = 'login',
  GOOGLE = 'google',
  ME = 'me',
}

export enum ItemEndpoints {
  LIST = '',
  CREATE = '',
  DETAIL = ':uuid',
  UPDATE = ':uuid',
  DELETE = ':uuid',
  OPEN = ':uuid/open',
  REPROCESS = 'reprocess',
}

export enum CategoryEndpoints {
  LIST = '',
  CREATE = '',
  REORDER = 'reorder',
  UPDATE = ':uuid',
  DELETE = ':uuid',
}

export enum TelegramEndpoints {
  CONNECT = 'connect',
  STATUS = 'status',
}
