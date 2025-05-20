import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

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

// Thứ tự kiểm tra từ khóa: từ cụ thể đến tổng quát
function detectAgent(message) {
  const msg = message.toLowerCase();
  if (msg.includes('hợp đồng') || msg.includes('pending')) return 'hopdong';
  if (msg.includes('bồi thường')) return 'claim';
  if (msg.includes('sbs') || msg.includes('học') || msg.includes('đào tạo')) return 'daotao';
  if (msg.includes('tuyển dụng') || msg.includes('ứng viên')) return 'tuyendung';
  if (msg.includes('thu nhập') || msg.includes('hoa hồng')) return 'thunhap';
  if (msg.includes('tư vấn') || msg.includes('khách hàng')) return 'tuvan';
  if (msg.includes('giả lập')) return 'tuyengia';
  // Đặt kiểm tra 'tuyển' cuối cùng để tránh nhận nhầm 'tuyển dụng'
  if (msg.includes('tuyển')) return 'tuyengia';
  return 'tongquan';
}

class GeneralAgent {
  async handleQuestion(message, userId, userName, userRole, agent_name = 'tongquan') {
    const detectedAgent = detectAgent(message);
    if (detectedAgent !== 'tongquan') {
      const notify = `Tôi sẽ kết nối bạn với bộ phận ${AGENT_LABELS[detectedAgent].toUpperCase()}, vui lòng chờ...`;
      const response = await this.callSpecializedAgent(message, detectedAgent, userId, userName, userRole);
      const fullResponse = notify + '\n\n' + (response.response || '');
      return {
        response: fullResponse,
        agent: detectedAgent
      };
    } else {
      return {
        response: `AI Tổng đang xử lý câu hỏi: "${message}"`,
        agent: 'tongquan'
      };
    }
  }

  async callSpecializedAgent(message, agent_name, userId, userName, userRole) {
    try {
      const response = await fetch('http://localhost:3000/agents/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INTERNAL_API_KEY || ''}`
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