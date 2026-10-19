import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import {
  CloseSidebar,
  HideProgressBar,
  ShowProgressBar,
  ToggleIsSidebarCollapsed,
  ToggleIsSidebarOpen,
  ToggleShowProgressBar,
} from './layout.state.actions';

export interface LayoutStateInterface {
  /**
   * Phone only: whether the sidebar is slid in over the page. On a desktop the sidebar is always
   * shown and this is ignored.
   */
  isSidebarOpen: boolean;
  /**
   * Desktop only: the sidebar shrunk to an icon rail. Optional because a persisted layout from
   * before the labeled sidebar has no such key, which must read as expanded.
   */
  isSidebarCollapsed?: boolean;
  showProgressBar: boolean;
}

@State<LayoutStateInterface>({
  name: 'layout',
  defaults: {
    isSidebarOpen: false,
    isSidebarCollapsed: false,
    showProgressBar: false,
  },
})
@Injectable()
export class LayoutState {
  @Selector()
  static isSidebarOpen(state: LayoutStateInterface): boolean {
    return state.isSidebarOpen;
  }

  @Selector()
  static isSidebarCollapsed(state: LayoutStateInterface): boolean {
    return state.isSidebarCollapsed ?? false;
  }

  @Selector()
  static showProgressBar(state: LayoutStateInterface): boolean {
    return state.showProgressBar;
  }

  @Action(ToggleIsSidebarOpen)
  setIsSidebarOpen({
    getState,
    patchState,
  }: StateContext<LayoutStateInterface>) {
    patchState({
      isSidebarOpen: !getState().isSidebarOpen,
    });
  }

  @Action(CloseSidebar)
  closeSidebar({ patchState }: StateContext<LayoutStateInterface>) {
    patchState({ isSidebarOpen: false });
  }

  @Action(ToggleIsSidebarCollapsed)
  toggleIsSidebarCollapsed({
    getState,
    patchState,
  }: StateContext<LayoutStateInterface>) {
    patchState({
      isSidebarCollapsed: !(getState().isSidebarCollapsed ?? false),
    });
  }

  @Action(ToggleShowProgressBar)
  toggleShowProgressBar({
    getState,
    patchState,
  }: StateContext<LayoutStateInterface>) {
    patchState({
      showProgressBar: !getState().showProgressBar,
    });
  }

  @Action(HideProgressBar)
  hideProgressBar({ patchState }: StateContext<LayoutStateInterface>) {
    patchState({
      showProgressBar: false,
    });
  }

  @Action(ShowProgressBar)
  showProgressBar({ patchState }: StateContext<LayoutStateInterface>) {
    patchState({
      showProgressBar: true,
    });
  }
}
