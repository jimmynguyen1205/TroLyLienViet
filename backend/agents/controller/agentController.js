import agentService from '../service/agent.js';
import memoryService from '../service/memory.js';
import generalAgent from '../service/generalAgent.js';
import supabase from '../../supabase.js';
import { OpenAIEmbeddings } from '@langchain/openai';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { Buffer } from 'buffer';
import mammoth from 'mammoth';
import xlsx from 'xlsx';

const agentController = {
  // Process message and get response from GPT
  async chat(req, res) {
    try {
      const { message, agent_name } = req.body;
      const userId = req.user?.id || 'test-user'; // Nếu chưa có auth thực, dùng tạm test-user

      if (!message) {
        return res.status(400).json({
          success: false,
          message: 'Message is required'
        });
      }

      let targetAgent = agent_name;
      let analysis = null;

      // Nếu không chỉ định agent, dùng general agent để xác định
      if (!targetAgent) {
        analysis = await generalAgent.analyzeQuestion(message);
        targetAgent = analysis.suggested_agent;

        // Nếu độ tin cậy thấp, trả về hướng dẫn chung
        if (analysis.confidence < 0.6) {
          return res.json({
            success: true,
            data: {
              response: `Tôi hiểu câu hỏi của bạn, nhưng để có thể trả lời chính xác hơn, bạn có thể thử hỏi trực tiếp với các AI chuyên biệt sau:\n\n` +
                `1. AI Hợp đồng: Cho các vấn đề về hợp đồng bảo hiểm\n` +
                `2. AI Đào tạo: Cho các vấn đề về nghiệp vụ và đào tạo\n` +
                `3. AI Claim: Cho các vấn đề về bồi thường và khiếu nại\n` +
                `4. AI Tuyển dụng: Cho các vấn đề về nhân sự và tuyển dụng`,
              agent_name: 'general',
              suggested_agent: targetAgent,
              confidence: analysis.confidence,
              reason: analysis.reason
            }
          });
        }

        // Gọi lại chat với agent được đề xuất
        return this.chat({
          ...req,
          body: {
            message,
            agent_name: targetAgent
          }
        }, res);
      }

      // Lấy lịch sử chat
      const history = await memoryService.getChatHistory(userId, targetAgent);
      // Gửi message tới agentService
      const result = await agentService.processMessage(message, targetAgent, history);

      // Lưu lịch sử chat
      await memoryService.addMessage(userId, targetAgent, 'user', message);
      await memoryService.addMessage(userId, targetAgent, 'assistant', result.response);

      return res.json({
        success: true,
        data: {
          response: result.response,
          agent_name: targetAgent,
          is_in_scope: result.is_in_scope,
          ...(result.suggested_agent && {
            suggested_agent: result.suggested_agent
          }),
          ...(targetAgent !== agent_name && analysis && {
            suggested_agent: targetAgent,
            confidence: analysis.confidence,
            reason: analysis.reason
          })
        }
      });
    } catch (error) {
      console.error('Error in chat:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get chat history for a specific agent
  async getChatHistory(req, res) {
    try {
      const { agentId } = req.params;
      const userId = req.user?.id || 'test-user';
      const history = await memoryService.getChatHistory(userId, agentId);
      return res.json({
        success: true,
        data: {
          agent_id: agentId,
          total_messages: history.length,
          messages: history
        }
      });
    } catch (error) {
      console.error('Error getting chat history:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Clear chat history for a specific agent
  async clearHistory(req, res) {
    try {
      const { agentId } = req.params;
      const userId = req.user?.id || 'test-user';
      await memoryService.clearHistory(userId, agentId);
      return res.json({
        success: true,
        message: 'Chat history cleared successfully'
      });
    } catch (error) {
      console.error('Error clearing chat history:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get list of available agents
  async getAgents(req, res) {
    try {
      const agents = [
        {
          id: 'ai-tong',
          name: 'AI Tổng',
          description: 'Điều hướng và phân tích câu hỏi'
        },
        {
          id: 'ai-hop-dong',
          name: 'AI Hợp đồng',
          description: 'Xử lý vấn đề hợp đồng bảo hiểm'
        },
        {
          id: 'ai-dao-tao',
          name: 'AI Đào tạo',
          description: 'Hướng dẫn và đào tạo nghiệp vụ'
        },
        {
          id: 'ai-claim',
          name: 'AI Claim',
          description: 'Xử lý bồi thường và khiếu nại'
        },
        {
          id: 'ai-tuyen-dung',
          name: 'AI Tuyển dụng',
          description: 'Thông tin tuyển dụng và phát triển nhân sự'
        }
      ];
      return res.json({
        success: true,
        data: agents
      });
    } catch (error) {
      console.error('Error getting agents list:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  async uploadTrainingDocument(req, res) {
    try {
      const userId = req.user?.id;
      const { agent_name } = req.body;
      const file = req.file;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      if (!file || !agent_name) {
        return res.status(400).json({ success: false, message: 'Thiếu file hoặc agent_name' });
      }

      let text = '';
      // Xác định loại file
      if (file.mimetype === 'application/pdf') {
        // Xử lý PDF
        const data = await pdfParse(file.buffer);
        text = data.text;
      } else if (file.mimetype.startsWith('image/')) {
        // Xử lý ảnh bằng OCR
        const { data: { text: ocrText } } = await Tesseract.recognize(file.buffer, 'vie+eng');
        text = ocrText;
      } else {
        return res.status(400).json({ success: false, message: 'Chỉ hỗ trợ PDF hoặc ảnh' });
      }

      if (!text || text.trim().length < 10) {
        return res.status(400).json({ success: false, message: 'Không trích xuất được nội dung từ file' });
      }

      // Tạo embedding
      const embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY });
      const vector = await embeddings.embedQuery(text.substring(0, 2000)); // Giới hạn 2000 ký tự đầu

      // Kiểm tra file_name đã tồn tại chưa
      const { data: existing, error: checkError } = await supabase
        .from('agent_documents')
        .select('id')
        .eq('file_name', file.originalname)
        .eq('agent_name', agent_name)
        .eq('created_by', userId)
        .maybeSingle();
      if (checkError) {
        return res.status(500).json({ success: false, message: 'Lỗi kiểm tra tài liệu', error: checkError });
      }

      if (existing && existing.id) {
        // Đã có, update
        const { error: updateError } = await supabase
          .from('agent_documents')
          .update({
            content: text,
            embedding: vector
          })
          .eq('id', existing.id);
        if (updateError) {
          return res.status(500).json({ success: false, message: 'Lỗi cập nhật tài liệu', error: updateError });
        }
        return res.json({ success: true, message: 'Đã cập nhật tài liệu huấn luyện' });
      } else {
        // Chưa có, insert mới
        const { error: insertError } = await supabase.from('agent_documents').insert([
          {
            agent_name,
            file_name: file.originalname,
            file_type: file.mimetype,
            content: text,
            embedding: vector,
            created_by: userId
          }
        ]);
        if (insertError) {
          return res.status(500).json({ success: false, message: 'Lỗi lưu vào database', error: insertError });
        }
        return res.json({ success: true, message: 'Đã thêm tài liệu huấn luyện mới' });
      }
    } catch (error) {
      console.error('Upload training document error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi xử lý file', error: error.message });
    }
  },

  async parseAndAnalyzeFile(req, res) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Thiếu file upload' });
      }
      if (file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'File vượt quá giới hạn 5MB' });
      }
      let text = '';
      // Xác định loại file
      if (file.mimetype === 'application/pdf') {
        // PDF
        const data = await pdfParse(file.buffer);
        text = data.text;
      } else if (file.mimetype.startsWith('image/')) {
        // Ảnh
        const { data: { text: ocrText } } = await Tesseract.recognize(file.buffer, 'vie+eng');
        text = ocrText;
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.mimetype === 'application/msword') {
        // Word
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        text = result.value;
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.mimetype === 'application/vnd.ms-excel') {
        // Excel
        const workbook = xlsx.read(file.buffer, { type: 'buffer' });
        let sheetTexts = [];
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
          rows.forEach(row => {
            sheetTexts.push(row.join(' | '));
          });
        });
        text = sheetTexts.join('\n');
      } else {
        return res.status(400).json({ error: 'Chỉ hỗ trợ PDF, ảnh, Word, Excel' });
      }
      if (!text || text.trim().length < 10) {
        return res.status(400).json({ error: 'Không trích xuất được nội dung từ file' });
      }
      // Gửi nội dung tới GPT
      const prompt = `Đây là nội dung người dùng gửi:\n\n${text.substring(0, 3000)}\n\nBạn hãy phân tích và đưa ra hướng xử lý phù hợp.`;
      const { OpenAI } = await import('@langchain/openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, modelName: 'gpt-3.5-turbo' });
      const response = await openai.call(prompt);
      return res.json({ response, filename: file.originalname });
    } catch (error) {
      console.error('parseAndAnalyzeFile error:', error);
      return res.status(500).json({ error: 'Lỗi xử lý file: ' + error.message });
    }
  },

  async chatWithFile(req, res) {
    try {
      const { message, agent_name } = req.body;
      const userId = req.user?.id || 'test-user';
      const file = req.file;
      let extractedText = '';
      let fileInfo = '';
      // Nếu có file, trích xuất nội dung
      if (file) {
        fileInfo = `\n\nNgười dùng gửi file: ${file.originalname}`;
        if (file.size > 5 * 1024 * 1024) {
          return res.status(400).json({ error: 'File vượt quá giới hạn 5MB' });
        }
        if (file.mimetype === 'application/pdf') {
          const data = await pdfParse(file.buffer);
          extractedText = data.text;
        } else if (file.mimetype.startsWith('image/')) {
          const { data: { text: ocrText } } = await Tesseract.recognize(file.buffer, 'vie+eng');
          extractedText = ocrText;
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.mimetype === 'application/msword') {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          extractedText = result.value;
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.mimetype === 'application/vnd.ms-excel') {
          const workbook = xlsx.read(file.buffer, { type: 'buffer' });
          let sheetTexts = [];
          workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            rows.forEach(row => {
              sheetTexts.push(row.join(' | '));
            });
          });
          extractedText = sheetTexts.join('\n');
        } else {
          return res.status(400).json({ error: 'Chỉ hỗ trợ PDF, ảnh, Word, Excel' });
        }
        if (!extractedText || extractedText.trim().length < 10) {
          return res.status(400).json({ error: 'Không trích xuất được nội dung từ file' });
        }
      }
      // Xác định agent phù hợp nếu là thư thỏa thuận hoặc file liên quan hợp đồng
      let targetAgent = agent_name;
      if (!targetAgent && file && file.originalname.toLowerCase().includes('thỏa thuận')) {
        targetAgent = 'ai-hop-dong';
      }
      // Ghép prompt
      let prompt = '';
      if (file) {
        prompt = `Nội dung file người dùng gửi:${fileInfo}\n\n${extractedText.substring(0, 3000)}`;
        if (message) {
          prompt += `\n\nCâu hỏi hoặc yêu cầu của người dùng: ${message}`;
        }
        prompt += '\n\nBạn hãy phân tích và đưa ra hướng xử lý phù hợp.';
      } else {
        prompt = message;
      }
      // Gửi tới AI chuyên môn phù hợp
      const { OpenAI } = await import('@langchain/openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, modelName: 'gpt-3.5-turbo' });
      const response = await openai.call(prompt);
      // Lưu lịch sử chat nếu muốn (tùy chỉnh)
      return res.json({
        success: true,
        data: {
          response,
          agent_name: targetAgent || 'general',
          file: file ? file.originalname : undefined
        }
      });
    } catch (error) {
      console.error('chatWithFile error:', error);
      return res.status(500).json({ error: 'Lỗi xử lý file/chat: ' + error.message });
    }
  }
};

export default agentController; 