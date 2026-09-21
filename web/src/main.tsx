import './assets/scss/custom.scss'
import './assets/scss/smartplanner-kanban.scss'
import './assets/scss/global-layering-fixes.scss'
import './assets/scss/sidebar-party-brand.scss'
import './assets/scss/vote-stream.scss'
import './assets/scss/vote-stream-agent.scss'
import './assets/scss/global-loading-bar.scss'
import './assets/scss/pbi-autosave.scss'
import './assets/scss/electoral-calendar.scss'
import './assets/scss/mobile-first.scss'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx'
import { Provider } from "react-redux";
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from './toolkit/index.ts';
import { AuthProvider } from './context/AuthContext.tsx';
import { CampaignProvider } from './context/CampaignContext.tsx';
import { OfflineSyncProvider } from './context/OfflineSyncContext.tsx';
import { LoadingBarProvider } from './context/LoadingBarContext.tsx';


const store = configureStore({ reducer: rootReducer, devTools: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.Fragment>
    <BrowserRouter>
      <Provider store={store}>
        <LoadingBarProvider>
          <AuthProvider>
            <CampaignProvider><OfflineSyncProvider><App /></OfflineSyncProvider></CampaignProvider>
          </AuthProvider>
        </LoadingBarProvider>
      </Provider>
    </BrowserRouter>
  </React.Fragment>,
)
