import supabase from '../supabase.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const claimScopePrompt = `Bạn là AI Claim của công ty bảo hiểm. Nhiệm vụ của bạn là phân tích xem câu hỏi có thuộc phạm vi xử lý của bạn không.

Phạm vi xử lý của bạn:
- Bồi thường bảo hiểm
- Khiếu nại
- Thủ tục bồi thường
- Giải quyết tranh chấp

Câu hỏi của người dùng: {question}

Hãy phân tích và trả về JSON với format:
{
  "is_in_scope": true/false,
  "reason": "lý do tại sao thuộc/không thuộc phạm vi"
}

Chỉ trả về JSON, không thêm text khác.`;

async function testAgentScope() {
  try {
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY
    });

    // Test cases
    const testCases = [
      // Trong phạm vi
      "Tôi muốn biết thủ tục bồi thường bảo hiểm y tế",
      "Làm sao để khiếu nại khi công ty từ chối bồi thường?",
      "Cần những giấy tờ gì để làm hồ sơ bồi thường?",
      "Tôi không đồng ý với số tiền bồi thường, làm sao để giải quyết?",
      
      // Ngoài phạm vi
      "Làm thế nào để gia hạn hợp đồng bảo hiểm?",
      "Tôi muốn tìm hiểu về chương trình đào tạo",
      "Công ty có tuyển dụng vị trí nào không?",
      "Phí bảo hiểm hàng năm là bao nhiêu?"
    ];

    console.log("Bắt đầu test phạm vi AI Claim...\n");

    for (const question of testCases) {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: claimScopePrompt.replace("{question}", question)
          }
        ]
      });

      const result = JSON.parse(response.choices[0].message.content);

      console.log("Câu hỏi:", question);
      console.log("Kết quả:", result);
      console.log("------------------------\n");
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testAgentScope(); 