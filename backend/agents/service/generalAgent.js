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

const AGENT_LABELS = {
  'tongquan': 'Tổng Quan',
  'hopdong': 'Hợp Đồng',
  'daotao': 'Đào Tạo',
  'claim': 'Bồi Thường',
  'tuyendung': 'Tuyển Dụng',
  'thunhap': 'Thu Nhập',
  'tuvan': 'Tư Vấn',
  'tuyengia': 'Tuyên Giá'
};

const AGENT_LIST = [
  'tongquan', 'hopdong', 'daotao', 'claim', 'tuyendung', 'thunhap', 'tuvan', 'tuyengia'
];

class GeneralAgent {
  constructor() {
    this.model = null;
    this.detectPrompt = PromptTemplate.fromTemplate(
      `Bạn là AI Tổng của công ty bảo hiểm. Hãy đọc câu hỏi và xác định agent phù hợp nhất để xử lý trong số các agent sau:
${AGENT_LIST.map(a => `- ${a}: ${AGENT_LABELS[a]}`).join('\n')}

Câu hỏi: {question}

Trả về JSON với format:
{"suggested_agent": "agent_tên_phù_hợp", "reason": "lý do", "confidence": 0.9}
Chỉ trả về JSON, không thêm text khác.`
    );
  }

  initializeOpenAI() {
      if (!this.model) {
        const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OpenAI API key not found');
      this.model = new OpenAI({ apiKey, modelName: 'gpt-3.5-turbo', temperature: 0.7 });
      }
      return this.model;
  }

  async detectAgent(message) {
    try {
      const model = this.initializeOpenAI();
      const prompt = await this.detectPrompt.format({ question: message });
      const response = await model.invoke(prompt);
      const result = JSON.parse(response.content);
      // Chuẩn hóa tên agent
      let agent = (result.suggested_agent || '').toLowerCase();
      if (!AGENT_LIST.includes(agent)) agent = 'tongquan';
      return { agent, reason: result.reason, confidence: result.confidence };
    } catch (err) {
      console.error('detectAgent error:', err);
      return { agent: 'tongquan', reason: 'Không xác định được agent', confidence: 0 };
    }
  }

  async handleQuestion(message, userId, userName, userRole, agent_name = 'tongquan') {
    // Nếu agent là tongquan, thực hiện detectAgent
    if (agent_name === 'tongquan') {
      const detection = await this.detectAgent(message);
      if (detection.agent !== 'tongquan' && detection.confidence > 0.6) {
        // Trả lời user về việc chuyển tuyến
        const notify = `Câu hỏi của bạn sẽ được chuyển đến bộ phận ${AGENT_LABELS[detection.agent]}, tôi sẽ kết nối bạn...`;
        // Gọi lại agent chuyên môn (nội bộ)
        const agentResponse = await this.callSpecializedAgent(message, detection.agent, userId, userName, userRole);
        // Kết hợp phản hồi
        return {
          response: notify + '\n\n' + (agentResponse.response || ''),
          agent: detection.agent,
          suggestion: detection,
          detail: agentResponse
        };
      } else {
        // Nếu không đề xuất agent khác, AI Tổng xử lý như thường
        return await this.handleGeneral(message, userId, userName, userRole);
      }
    } else {
      // Nếu không phải tongquan, xử lý như thường
      return await this.handleGeneral(message, userId, userName, userRole, agent_name);
    }
  }

  async handleGeneral(message, userId, userName, userRole, agent_name = 'tongquan') {
    // Ở đây bạn có thể giữ logic AI Tổng hiện tại hoặc đơn giản trả về phản hồi mẫu
    // (Có thể mở rộng để gọi GPT trả lời tổng quan nếu muốn)
    return {
      response: `AI Tổng đang xử lý câu hỏi: "${message}"`,
      agent: agent_name
    };
  }

  async callSpecializedAgent(message, agent_name, userId, userName, userRole) {
    try {
      // Gọi API /agents/chat với agent chuyên môn
      const response = await fetch('http://localhost:3000/agents/chat', {
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
      if (!response.ok) throw new Error('Failed to call specialized agent');
      return await response.json();
    } catch (error) {
      console.error('Error calling specialized agent:', error);
      return { response: 'Không thể kết nối tới agent chuyên môn.' };
    }
  }
}

export default new GeneralAgent(); 