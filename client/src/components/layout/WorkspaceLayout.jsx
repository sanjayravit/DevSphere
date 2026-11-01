import React from 'react';
import { WorkspaceProvider } from '../../context/WorkspaceContext';
import { Layout } from './Layout';
// Public routes do not need workspace data, sidebars or their dependencies.
export default function WorkspaceLayout() {
  return <WorkspaceProvider><Layout /></WorkspaceProvider>;
}
