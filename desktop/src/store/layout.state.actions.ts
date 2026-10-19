/** Opens or closes the phone sidebar, which slides in over the page. */
export class ToggleIsSidebarOpen {
  static readonly type = '[Layout] Toggle isSidebarOpen';
  constructor() {}
}

export class CloseSidebar {
  static readonly type = '[Layout] Close sidebar';
  constructor() {}
}

/** Switches the desktop sidebar between labeled and an icon-only rail. */
export class ToggleIsSidebarCollapsed {
  static readonly type = '[Layout] Toggle isSidebarCollapsed';
  constructor() {}
}

export class ToggleShowProgressBar {
  static readonly type = '[Layout] Toggle showProgressBar';
  constructor() {}
}

export class HideProgressBar {
  static readonly type = '[Layout] Hide progressBar';
  constructor() {}
}

export class ShowProgressBar {
  static readonly type = '[Layout] Show progressBar';
  constructor() {}
}
