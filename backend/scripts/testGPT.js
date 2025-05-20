import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testGPT() {
  try {
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY
    });

    // Test message
    const message = "tôi muốn hỏi xử lý hợp đồng";

    // Test prompt
    const prompt = `Bạn là AI Tổng của công ty bảo hiểm. Hãy phân tích câu hỏi và xác định agent phù hợp nhất để xử lý.

Câu hỏi: ${message}

Trả về JSON với format:
{
  "suggested_agent": "agent_tên_phù_hợp",
  "reason": "lý do",
  "confidence": 0.9
}

Chỉ trả về JSON, không thêm text khác.`;

    console.log("Testing GPT API...\n");
    console.log("Input message:", message);
    console.log("Sending request to OpenAI...\n");

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: prompt
        }
      ]
    });

    const result = JSON.parse(response.choices[0].message.content);
    console.log("Response from GPT:", result);

  } catch (error) {
    console.error('Error:', error);
  }
}

testGPT(); 