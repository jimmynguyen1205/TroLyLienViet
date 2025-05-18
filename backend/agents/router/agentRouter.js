import express from 'express';
import { auth } from '../../middleware/auth.js';
import agentController from '../controller/agentController.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Process message and route to appropriate agent
router.post('/chat', agentController.processMessage);

// Get chat history for a specific agent
router.get('/history/:agentId', agentController.getChatHistory);

// Clear chat history for a specific agent
router.delete('/history/:agentId', agentController.clearHistory);

// Get list of available agents
router.get('/list', agentController.getAgents);

export default router; 