import agentService from '../service/agent.js';
import memoryService from '../service/memory.js';

class AgentController {
  // Process message and route to appropriate agent
  async processMessage(req, res) {
    try {
      const { message } = req.body;
      const userId = req.user.id;

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const response = await agentService.routeMessage(userId, message);
      res.json(response);
    } catch (error) {
      console.error('Error in processMessage:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get chat history for a specific agent
  async getChatHistory(req, res) {
    try {
      const { agentId } = req.params;
      const userId = req.user.id;

      const history = await memoryService.getChatHistory(userId, agentId);
      res.json(history);
    } catch (error) {
      console.error('Error in getChatHistory:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Clear chat history for a specific agent
  async clearHistory(req, res) {
    try {
      const { agentId } = req.params;
      const userId = req.user.id;

      const success = await memoryService.clearHistory(userId, agentId);
      if (success) {
        res.json({ message: 'Chat history cleared successfully' });
      } else {
        res.status(500).json({ error: 'Failed to clear chat history' });
      }
    } catch (error) {
      console.error('Error in clearHistory:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get list of available agents
  async getAgents(req, res) {
    try {
      const agents = Object.entries(agentService.getAgentConfig()).map(([id, config]) => ({
        id,
        name: config.name,
        description: config.description
      }));
      res.json(agents);
    } catch (error) {
      console.error('Error in getAgents:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default new AgentController(); 