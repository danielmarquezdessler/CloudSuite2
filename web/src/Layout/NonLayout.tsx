import React from 'react';
import { ReactNode } from 'react';
import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { changeThemeLayout, changeThemeMode, changeThemePreset } from '../toolkit/thunk';
import { changeLayoutTheme, changeSidebarTheme, changeSidebarThemeCaptions } from '../toolkit/themeLayouts/thunk';
import { createSelector } from "reselect";


interface NonLayoutProps {
    children: ReactNode;
}

const NonLayout = ({ children }: NonLayoutProps) => {


    const dispatch = useDispatch<any>();

    const selectLayoutProperties = createSelector(
        (state: any) => state.Theme,
        (layout) => ({
            themeMode: layout.themeMode,
            layoutTheme: layout.layoutTheme,
            themePreset: layout.themePreset,
            themeLayout: layout.themeLayout,
            sidebarTheme: layout.sidebarTheme,
            sidebarThemeCaptions: layout.sidebarThemeCaptions,
        })
    );
    // Inside your component
    const {
        themeMode,
        themePreset,
        layoutTheme,
        themeLayout,
        sidebarTheme,
        sidebarThemeCaptions,
    } = useSelector(selectLayoutProperties);

    /*
      layout settings
      */
    useEffect(() => {
        if (
            themeMode ||
            layoutTheme ||
            themePreset ||
            themeLayout ||
            sidebarTheme ||
            sidebarThemeCaptions
        ) {
            dispatch(changeThemeMode(themeMode));
            dispatch(changeLayoutTheme(layoutTheme));
            dispatch(changeThemePreset(themePreset));
            dispatch(changeThemeLayout(themeLayout));
            dispatch(changeSidebarTheme(sidebarTheme));
            dispatch(changeSidebarThemeCaptions(sidebarThemeCaptions));
        }
    }, [
        themeMode,
        layoutTheme,
        themePreset,
        themeLayout,
        sidebarTheme,
        sidebarThemeCaptions,
        dispatch
    ]);


    return (
        <React.Fragment>
            {children}
        </React.Fragment>
    );
};




export default NonLayout;