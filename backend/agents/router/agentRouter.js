import express from 'express';
import { auth } from '../../middleware/auth.js';
import agentController from '../controller/agentController.js';
import multer from 'multer';

const router = express.Router();

// Cấu hình multer để upload file vào bộ nhớ
const upload = multer({ storage: multer.memoryStorage() });

// Apply auth middleware to all routes
router.use(auth);

// Process message and get response from GPT
router.post('/chat', upload.single('file'), agentController.chatWithFile);

// Get chat history for a specific agent
router.get('/history/:agentId', agentController.getChatHistory);

// Clear chat history for a specific agent
router.delete('/history/:agentId', agentController.clearHistory);

// Get list of available agents
router.get('/list', agentController.getAgents);

// Route upload tài liệu huấn luyện AI
router.post('/train/upload', auth, upload.single('file'), agentController.uploadTrainingDocument);

// Route upload file và nhờ AI phân tích tức thì (không lưu DB)
router.post('/upload/parse', upload.single('file'), agentController.parseAndAnalyzeFile);

export default router; 