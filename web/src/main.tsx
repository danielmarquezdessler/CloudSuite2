import './assets/scss/custom.scss'
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


const store = configureStore({ reducer: rootReducer, devTools: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.Fragment>
    <BrowserRouter>
      <Provider store={store}>
        <AuthProvider>
          <CampaignProvider><OfflineSyncProvider><App /></OfflineSyncProvider></CampaignProvider>
        </AuthProvider>
      </Provider>
    </BrowserRouter>
  </React.Fragment>,
)
