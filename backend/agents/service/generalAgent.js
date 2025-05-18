import { OpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const AGENT_DESCRIPTIONS = {
  'ai-hop-dong': 'Xử lý các vấn đề về hợp đồng bảo hiểm, điều khoản, quyền lợi, nghĩa vụ, gia hạn, hủy hợp đồng.',
  'ai-dao-tao': 'Hướng dẫn và đào tạo nghiệp vụ, quy trình làm việc, kỹ năng bán hàng, chăm sóc khách hàng.',
  'ai-claim': 'Xử lý bồi thường, khiếu nại, hướng dẫn thủ tục, giải quyết tranh chấp.',
  'ai-tuyen-dung': 'Thông tin về tuyển dụng, phát triển nhân sự, chính sách nhân sự, đào tạo nội bộ.'
};

const agentMap = {
  'contract': 'ai-hop-dong',
  'training': 'ai-dao-tao',
  'claim': 'ai-claim',
  'recruitment': 'ai-tuyen-dung'
};

const agentNames = {
  'ai-hop-dong': 'Hợp Đồng',
  'ai-dao-tao': 'Đào Tạo',
  'ai-claim': 'Claim',
  'ai-tuyen-dung': 'Tuyển Dụng'
};

class GeneralAgent {
  constructor() {
    this.model = null;
    const template = `Bạn là AI Tổng của công ty bảo hiểm. Nhiệm vụ của bạn là phân tích câu hỏi và xác định nên chuyển đến AI nào phù hợp nhất.

Các AI hiện có:
1. AI Hợp đồng: Xử lý các vấn đề về hợp đồng bảo hiểm, điều khoản, quyền lợi, nghĩa vụ, gia hạn, hủy hợp đồng.
2. AI Đào tạo: Hướng dẫn và đào tạo nghiệp vụ, quy trình làm việc, kỹ năng bán hàng, chăm sóc khách hàng.
3. AI Claim: Xử lý bồi thường, khiếu nại, hướng dẫn thủ tục, giải quyết tranh chấp.
4. AI Tuyển dụng: Thông tin về tuyển dụng, phát triển nhân sự, chính sách nhân sự, đào tạo nội bộ.

Câu hỏi của người dùng: {question}

Hãy phân tích và trả về JSON với format:
{
  "suggested_agent": "tên_agent_phù_hợp_nhất",
  "reason": "lý do tại sao chọn agent này",
  "confidence": 0.85
}

Chỉ trả về JSON, không thêm text khác.`;

    this.promptTemplate = PromptTemplate.fromTemplate(template);
  }

  // Khởi tạo OpenAI client khi cần
  initializeOpenAI() {
    try {
      if (!this.model) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          console.error('OpenAI API key not found in environment variables');
          throw new Error('OpenAI API key not found in environment variables');
        }
        this.model = new OpenAI({ 
          apiKey,
          modelName: 'gpt-3.5-turbo',
          temperature: 0.7
        });
      }
      return this.model;
    } catch (error) {
      console.error('Error initializing OpenAI:', error);
      throw error;
    }
  }

  async analyzeQuestion(question) {
    try {
      const model = this.initializeOpenAI();
      const prompt = await this.promptTemplate.format({ question });
      const response = await model.invoke(prompt);
      const result = JSON.parse(response.content);

      // Map tên agent từ suggestion sang agent_name
      const suggestedAgentName = agentMap[result.suggested_agent];
      if (!suggestedAgentName) {
        throw new Error('Invalid suggested agent');
      }

      return {
        suggested_agent: suggestedAgentName,
        reason: result.reason,
        confidence: result.confidence
      };
    } catch (error) {
      console.error('Error analyzing question:', error);
      return {
        suggested_agent: 'ai-hop-dong',
        reason: 'Không thể phân tích câu hỏi, chuyển đến AI Hợp đồng',
        confidence: 0.5
      };
    }
  }

  async handleQuestion(question, userId, userName, userRole) {
    try {
      // Phân tích câu hỏi
      const analysis = await this.analyzeQuestion(question);

      // Nếu độ tin cậy > 0.75, chuyển đến agent chuyên môn
      if (analysis.confidence > 0.75) {
        // Tạo câu chào mừng
        const welcomeMessage = `📌 Câu hỏi của bạn liên quan đến bộ phận ${agentNames[analysis.suggested_agent]}. Tôi sẽ kết nối bạn ngay nhé…\n\n`;

        // Gọi agent chuyên môn
        const agentResponse = await this.callSpecializedAgent(question, analysis.suggested_agent, userId, userName, userRole);

        // Ghép câu chào và câu trả lời
        return {
          response: welcomeMessage + agentResponse.response,
          intent: agentResponse.intent,
          agent: agentResponse.agent,
          suggestion: analysis
        };
      }

      // Nếu độ tin cậy <= 0.75, yêu cầu làm rõ
      return {
        response: "Tôi chưa chắc chắn bạn đang hỏi về nghiệp vụ nào. Bạn có thể nói rõ hơn không?",
        intent: 'hỏi_làm_rõ',
        agent: {
          name: 'AI Tổng',
          description: 'Phân tích và chuyển tuyến câu hỏi',
          icon: '🤖'
        },
        suggestion: analysis
      };
    } catch (error) {
      console.error('Error handling question:', error);
      throw error;
    }
  }

  async callSpecializedAgent(message, agent_name, userId, userName, userRole) {
    try {
      // Gọi API /agents/chat với agent chuyên môn
      const response = await fetch('http://localhost:3005/agents/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`
        },
        body: JSON.stringify({
          message,
          agent_name,
          userId,
          userName,
          userRole
        })
      });

      if (!response.ok) {
        throw new Error('Failed to call specialized agent');
      }

      return await response.json();
    } catch (error) {
      console.error('Error calling specialized agent:', error);
      throw error;
    }
  }
}

export default new GeneralAgent(); 