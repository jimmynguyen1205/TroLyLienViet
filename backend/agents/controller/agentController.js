import agentService from '../service/agent.js';
import memoryService from '../service/memory.js';
import generalAgent from '../service/generalAgent.js';

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
  }
};

export default agentController; 