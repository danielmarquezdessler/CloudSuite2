import React, { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { nonAuthRoutes, routes } from './allRoutes'
import Layout from '../Layout'
import NonLayout from '../Layout/NonLayout'
import { useAuth } from '../context/AuthContext'

const LoadingScreen = () => <div className="min-vh-100 d-flex align-items-center justify-content-center">Cargando sesión…</div>

const RequireAuth = ({ children }: { children: ReactNode }) => {
    const { user, loading } = useAuth()
    if (loading) return <LoadingScreen />
    return user ? <>{children}</> : <Navigate to="/" replace />
}

const PublicOnlyRoute = ({ children }: { children: ReactNode }) => {
    const { user, loading } = useAuth()
    if (loading) return <LoadingScreen />
    return user ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

const Routing = () => {
    return (
        <React.Fragment>
            <Routes>
                {(routes || []).map((item, key) => (
                    <Route key={key} path={item.path} element={
                        <RequireAuth>
                            <Layout>
                                {item.component}
                            </Layout>
                        </RequireAuth>
                    } />
                ))}

                {(nonAuthRoutes || []).map((item, key) => (
                    <Route key={key} path={item.path} element={
                        ['/register', '/join-invitation'].includes(item.path) ? (
                            <NonLayout>{item.component}</NonLayout>
                        ) : (
                            <PublicOnlyRoute>
                                <NonLayout>
                                    {item.component}
                                </NonLayout>
                            </PublicOnlyRoute>
                        )
                    } />
                ))}
            </Routes>
        </React.Fragment>
    )
}

export default Routing 
